package com.villarosa

import com.villarosa.exception.DomainException
import com.villarosa.repository.*
import com.villarosa.repository.model.*
import com.villarosa.security.*
import com.villarosa.service.*
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@ActiveProfiles("test")
@Testcontainers
@Import(GuestPropertyClock::class)
class GuestProfilesIT
@Autowired
constructor(
    private val service: CustomerService,
    private val guests: CustomerRepository,
    private val rooms: ApartmentRepository,
    private val bookings: ReservationRepository,
    private val inventory: ReservationService,
    private val jdbc: JdbcTemplate,
) {
    @BeforeEach
    fun fixtures() {
        TestData.reset(jdbc, database.jdbcUrl)
        TestData.seedOwner(jdbc, index = 1)
    }

    private fun guest(first: String = "Јана", last: String = "Гостин", phone: String? = null) =
        service.createCustomer(first, last, phone, null)

    private fun code(action: () -> Unit): String = assertThrows<DomainException>(action).code

    @Test
    fun namesAndOptionalContactsAreNormalizedWithoutInventingMissingInformation() {
        val id =
            service.createCustomer(
                "  Јана  ",
                " Гостин ",
                "00389 (70) 123-456",
                " Synthetic  address ",
                " OWNER@EXAMPLE.TEST ",
                "Late arrival\nUse side door",
            )
        val row = service.findCustomerById(id).get()
        assertThat(row.firstName).isEqualTo("Јана")
        assertThat(row.phone).isEqualTo("+38970123456")
        assertThat(row.email).isEqualTo("owner@example.test")
        assertThat(row.address).isEqualTo("Synthetic address")
        assertThat(row.notes).contains("\n")
        val missing = service.findCustomerById(guest("Walk", "In")).get()
        assertThat(listOf(missing.phone, missing.email, missing.address, missing.notes))
            .containsOnlyNulls()
    }

    @ParameterizedTest
    @ValueSource(strings = ["abc", "+", "12+34", "123 extension 7", "123456789012345678901"])
    fun invalidPhoneNumbersHaveSafeErrorsAndCreateNothing(phone: String) {
        assertThat(code { guest(phone = phone) }).isEqualTo("INVALID_PHONE")
        assertThat(guests.count()).isZero()
    }

    @Test
    fun combinedUnicodeNameAndPhoneSearchUsesAllTokensAndLiteralWildcards() {
        val wanted = guest(phone = "+389 70 123 456")
        guest("Јана", "Друг", "+389 71 999 999")
        guest("Other", "Гостин", "+389 70 123 456")
        assertThat(service.query("гостин јАНА", "70-123", false, 0, 10).items.map { it.id })
            .containsExactly(wanted)
        assertThat(service.query("%", null, false, 0, 10).items).isEmpty()
        assertThat(service.query("_", null, false, 0, 10).items).isEmpty()
        assertThat(service.query("No match", "70123", false, 0, 10).items).isEmpty()
    }

    @Test
    fun pagesUseStableExclusiveCursorsAndCanIncludeArchivedGuests() {
        val ids = (1..4).map { guest("Page", "Guest $it") }
        service.status(ids[1], 0, false)
        val first = service.query(null, null, false, 0, 2)
        assertThat(first.items.map { it.id }).containsExactly(ids[0], ids[2])
        assertThat(first.nextCursor).isEqualTo(ids[2])
        val second = service.query(null, null, false, first.nextCursor!!, 2)
        assertThat(second.items.map { it.id }).containsExactly(ids[3])
        assertThat(second.nextCursor).isNull()
        assertThat(service.query(null, null, true, 0, 10).items).hasSize(4)
        assertThat(code { service.query(null, null, false, -1, 10) }).isEqualTo("INVALID_CURSOR")
        assertThat(code { service.query(null, null, false, 0, 101) }).isEqualTo("INVALID_PAGE_SIZE")
    }

    @Test
    fun duplicateNamesRequireReviewAndSharedPhonesNeverMergePeople() {
        val first = guest(phone = "070123456")
        val family = guest("Other", "Person", "070123456")
        assertThat(family).isNotEqualTo(first)
        assertThat(code { guest("јана", "гостин", "070999999") }).isEqualTo("POSSIBLE_DUPLICATE")
        val matches =
            service.duplicates(GuestProfile("Јана", "Гостин", "070123456", null, null, null))
        assertThat(matches.map { it.id }).containsExactly(first, family)
        val separate = service.createCustomer("Јана", "Гостин", null, null, allowDuplicate = true)
        assertThat(separate).isNotEqualTo(first)
        assertThat(guests.count()).isEqualTo(3)
    }

    @Test
    fun duplicateReviewIncludesArchivedEmailsAndNormalizesLegacyInternationalPhones() {
        val id = service.createCustomer("Different", "Name", null, null, "CONTACT@example.test")
        service.status(id, 0, false)
        val legacy =
            guests.saveAndFlush(
                Customer(firstName = "Legacy", lastName = "Phone", phone = "00389 (70) 123-456")
            )
        val matches =
            service.duplicates(
                GuestProfile("No", "Match", "+389 70 123 456", null, "contact@example.test", null)
            )
        assertThat(matches.map { it.id }).containsExactly(id, legacy.id)
    }

    @Test
    fun profileEditsAndRestorationRequireTheReviewedVersionAndKeepOldValuesOnStaleWrites() {
        val id = guest()
        val profile =
            GuestProfile("Јана", "Updated", null, null, "guest@example.test", "Synthetic note")
        val changed = service.update(id, 0, profile)
        assertThat(changed.version).isEqualTo(1)
        assertThat(code { service.update(id, 0, profile.copy(lastName = "Stale")) })
            .isEqualTo("STALE_VERSION")
        assertThat(code { service.status(id, 0, false) }).isEqualTo("STALE_VERSION")
        val archived = service.status(id, changed.version, false)
        val restored = service.status(id, archived.version, true)
        assertThat(restored.active).isTrue()
        assertThat(restored.lastName).isEqualTo("Updated")
        assertThat(service.status(id, restored.version, true).version).isEqualTo(restored.version)
        assertThat(code { service.status(id, -1, false) }).isEqualTo("INVALID_VERSION")
        assertThat(code { service.update(Int.MAX_VALUE, 0, profile) }).isEqualTo("NOT_FOUND")
    }

    @Test
    fun archivalProtectsCurrentAndFutureStaysAndRetainsCancelledAndPastHistory() {
        val id = guest()
        val room = rooms.saveAndFlush(Apartment(capacity = 3))
        val saved =
            inventory.create(
                id,
                room.id!!,
                "2099-01-01",
                "2099-01-03",
                2,
                UUID.randomUUID().toString(),
            )
        assertThat(code { service.status(id, 0, false) }).isEqualTo("GUEST_HAS_BOOKINGS")
        inventory.cancel(saved.resourceId, 0, UUID.randomUUID().toString())
        bookings.saveAndFlush(
            Reservation(
                customerId = id,
                roomId = room.id,
                startDate = LocalDate.of(2000, 1, 1),
                endDate = LocalDate.of(2000, 1, 3),
            )
        )
        service.status(id, 0, false)
        val page = service.history(id, 0, 1, null)
        assertThat(page.items).hasSize(1)
        assertThat(page.nextCursor).isNotNull()
        assertThat(service.history(id, page.nextCursor!!, 1, null).items.single().status)
            .isEqualTo(ReservationStatus.CANCELLED)
        assertThat(service.findCustomerById(id).get().active).isFalse()
        assertThat(service.history(id, 0, 100, ReservationStatus.ACTIVE).items).hasSize(1)
        assertThat(code { service.history(id, -1, 10, null) }).isEqualTo("INVALID_CURSOR")
        assertThat(code { service.history(id, 0, 0, null) }).isEqualTo("INVALID_PAGE_SIZE")
        assertThat(
                code {
                    inventory.create(
                        id,
                        room.id!!,
                        "2099-02-01",
                        "2099-02-03",
                        1,
                        UUID.randomUUID().toString(),
                    )
                }
            )
            .isEqualTo("GUEST_ARCHIVED")
        assertThat(
                code {
                    inventory.change(
                        page.items.single().id!!,
                        "2099-02-01",
                        "2099-02-03",
                        1,
                        0,
                        UUID.randomUUID().toString(),
                    )
                }
            )
            .isEqualTo("GUEST_ARCHIVED")
    }

    @ParameterizedTest
    @ValueSource(strings = ["UPDATE", "ARCHIVE", "RESTORE"])
    fun failedAuditRollsBackTheProfileAndItsVersion(action: String) {
        val id = guest()
        if (action == "RESTORE") service.status(id, 0, false)
        val before = service.findCustomerById(id).get()
        jdbc.execute(
            "CREATE TRIGGER reject_profile_audit BEFORE INSERT ON business_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic audit failure'"
        )
        try {
            assertThrows<org.springframework.dao.DataAccessException> {
                when (action) {
                    "UPDATE" ->
                        service.update(
                            id,
                            before.version,
                            GuestProfile("Edited", "Guest", null, null, null, null),
                        )
                    "ARCHIVE" -> service.status(id, before.version, false)
                    else -> service.status(id, before.version, true)
                }
            }
            val after = service.findCustomerById(id).get()
            assertThat(after).isEqualTo(before)
        } finally {
            jdbc.execute("DROP TRIGGER reject_profile_audit")
        }
    }

    @Test
    fun competingArchivalAndBookingCannotCommitAnActiveStayForAnArchivedGuest() {
        val id = guest()
        val room = rooms.saveAndFlush(Apartment(capacity = 3))
        val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val actions =
                listOf<() -> Unit>(
                    { service.status(id, 0, false) },
                    {
                        inventory.create(
                            id,
                            room.id!!,
                            "2099-03-01",
                            "2099-03-03",
                            1,
                            UUID.randomUUID().toString(),
                        )
                    },
                )
            val results = actions.mapIndexed { index, action ->
                executor.submit<String> {
                    SecurityContextHolder.getContext().authentication =
                        StaffAuthentication(TestData.ownerIdentity(index))
                    try {
                        check(start.await(10, TimeUnit.SECONDS))
                        action()
                        "COMMITTED"
                    } catch (failure: DomainException) {
                        failure.code
                    } finally {
                        SecurityContextHolder.clearContext()
                    }
                }
            }
            start.countDown()
            val outcomes = results.map { it.get(15, TimeUnit.SECONDS) }
            assertThat(outcomes.count { it == "COMMITTED" }).isEqualTo(1)
            assertThat(outcomes.filter { it != "COMMITTED" }).allMatch {
                it in setOf("GUEST_ARCHIVED", "GUEST_HAS_BOOKINGS")
            }
            assertThat(
                    jdbc.queryForObject(
                        "SELECT COUNT(*) FROM reservations r JOIN customers c ON c.id=r.customer_id WHERE r.status='ACTIVE' AND c.active=FALSE",
                        Long::class.java,
                    )
                )
                .isZero()
        } finally {
            start.countDown()
            executor.shutdownNow()
            check(executor.awaitTermination(10, TimeUnit.SECONDS))
        }
    }

    @Test
    fun everyReadAndWriteRejectsAnUnrecognizedStaffIdentityWithoutLeakingContacts() {
        val id = guest(phone = "070123456")
        SecurityContextHolder.getContext().authentication =
            StaffAuthentication(StaffIdentity(UUID.randomUUID().toString(), 0))
        val profile = GuestProfile("Private", "Guest", null, null, null, null)
        for (action in
            listOf<() -> Unit>(
                { service.findCustomerById(id) },
                { service.query(null, null, true, 0, 10) },
                { service.duplicates(profile) },
                { service.history(id, 0, 10, null) },
                { service.update(id, 0, profile) },
                { service.status(id, 0, false) },
            )) {
            assertThat(code(action)).isEqualTo("SESSION_REVOKED")
        }
    }

    @Test
    fun anotherPropertysGuestIsNeverReturnedOrMutated() {
        val foreign =
            guests.saveAndFlush(
                Customer(firstName = "Foreign", lastName = "Guest", propertyId = "other")
            )
        assertThat(service.findCustomerById(foreign.id!!)).isEmpty
        assertThat(service.query(null, null, true, 0, 100).items).isEmpty()
        assertThat(code { service.status(foreign.id!!, 0, false) }).isEqualTo("NOT_FOUND")
        assertThat(code { service.history(foreign.id!!, 0, 10, null) }).isEqualTo("NOT_FOUND")
    }

    @Test
    fun checkoutTodayUsesSkopjeCalendarEvenWhenUtcIsStillThePreviousDay() {
        val checkedOut = guest("Checked", "Out")
        val current = guest("Current", "Stay")
        val room = rooms.saveAndFlush(Apartment(capacity = 3))
        bookings.saveAndFlush(
            Reservation(
                customerId = checkedOut,
                roomId = room.id,
                startDate = LocalDate.of(2026, 11, 6),
                endDate = LocalDate.of(2026, 11, 7),
            )
        )
        bookings.saveAndFlush(
            Reservation(
                customerId = current,
                roomId = room.id,
                startDate = LocalDate.of(2026, 11, 7),
                endDate = LocalDate.of(2026, 11, 8),
            )
        )
        assertThat(service.status(checkedOut, 0, false).active).isFalse()
        assertThat(code { service.status(current, 0, false) }).isEqualTo("GUEST_HAS_BOOKINGS")
    }

    companion object {
        @Container @JvmField val database = TestDatabases.mariaDb()

        @JvmStatic
        @BeforeAll
        fun migrate() {
            DatabaseMigrations.migrate(database.jdbcUrl, database.username, database.password)
        }

        @JvmStatic
        @DynamicPropertySource
        fun properties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", database::getJdbcUrl)
            registry.add("spring.datasource.username", database::getUsername)
            registry.add("spring.datasource.password", database::getPassword)
            registry.add("spring.datasource.driver-class-name", database::getDriverClassName)
            registry.add("spring.jpa.hibernate.ddl-auto") { "validate" }
            registry.add("spring.session.jdbc.initialize-schema") { "never" }
        }
    }
}

@TestConfiguration(proxyBeanMethods = false)
class GuestPropertyClock {
    @Bean
    @Primary
    fun guestClock(): Clock = Clock.fixed(Instant.parse("2026-11-06T23:30:00Z"), ZoneOffset.UTC)
}
