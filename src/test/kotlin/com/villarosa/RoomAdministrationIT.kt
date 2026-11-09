package com.villarosa

import com.villarosa.exception.DomainException
import com.villarosa.repository.*
import com.villarosa.repository.model.*
import com.villarosa.security.*
import com.villarosa.service.*
import java.time.LocalDate
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
import org.springframework.context.annotation.Import
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
class RoomAdministrationIT
@Autowired
constructor(
    private val service: ApartmentService,
    private val guests: CustomerRepository,
    private val rooms: ApartmentRepository,
    private val bookings: ReservationRepository,
    private val inventory: ReservationService,
    private val quotes: QuoteService,
    private val queries: InventoryQueries,
    private val jdbc: JdbcTemplate,
    private val transactionManager: org.springframework.transaction.PlatformTransactionManager,
) {
    private val reviewed = ReviewedChanges(inventory, quotes, transactionManager)

    @BeforeEach
    fun fixtures() {
        TestData.reset(jdbc, database.jdbcUrl)
        TestData.seedOwner(jdbc, index = 1)
    }

    private fun profile(reference: String = "GARDEN-1", capacity: Int = 4) =
        RoomProfile(
            " Garden studio ",
            reference,
            capacity,
            "South",
            "Garden",
            "Queen and sofa bed",
            "Wi-Fi, terrace",
            "1",
        )

    private fun guest() = guests.saveAndFlush(Customer(firstName = "Synthetic", lastName = "Guest"))

    private fun key() = UUID.randomUUID().toString()

    private fun createBooking(room: Apartment, count: Int = 3): OperationResult {
        TestData.configureSyntheticRate(jdbc, room.id!!)
        val quote = quotes.create(room.id!!, "2099-01-01", "2099-01-04", count)
        return inventory.create(
            guest().id!!,
            room.id!!,
            "2099-01-01",
            "2099-01-04",
            count,
            key(),
            quote.id,
        )
    }

    private fun failure(action: () -> Unit) = assertThrows<DomainException> { action() }

    @Test
    fun namesReferencesAndAttributesAreSavedWithoutCreatingFinancialRates() {
        val room = service.create(profile(" garden-1 "))
        assertThat(room.name).isEqualTo("Garden studio")
        assertThat(room.reference).isEqualTo("GARDEN-1")
        assertThat(room.bedConfiguration).isEqualTo("Queen and sofa bed")
        assertThat(room.features).isEqualTo("Wi-Fi, terrace")
        assertThat(room.regularPrice).isNull()
        assertThat(room.topSeasonPrice).isNull()
        assertThat(failure { service.create(profile("Garden-1")) }.code)
            .isEqualTo("ROOM_REFERENCE_EXISTS")
    }

    @Test
    fun roomDirectoryUsesBoundedExclusiveCursorsAndLiteralNameOrReferenceSearch() {
        val ids = (1..4).map { service.create(profile("ROOM-$it")).id!! }
        service.status(ids[1], 0, false)
        val first = service.directory(null, false, 0, 2)
        assertThat(first.items.map { it.id }).containsExactly(ids[0], ids[2])
        assertThat(first.nextCursor).isEqualTo(ids[2])
        assertThat(service.directory(null, false, first.nextCursor!!, 2).items.map { it.id })
            .containsExactly(ids[3])
        assertThat(service.directory("room-2", true, 0, 10).items.single().active).isFalse()
        assertThat(service.directory("garden", false, 0, 10).items).hasSize(3)
        assertThat(service.directory("%", true, 0, 10).items).isEmpty()
        assertThat(failure { service.directory(null, false, -1, 10) }.code)
            .isEqualTo("INVALID_CURSOR")
        assertThat(failure { service.directory(null, false, 0, 101) }.code)
            .isEqualTo("INVALID_PAGE_SIZE")
    }

    @Test
    fun roomEditsAndStatusChangesRequireTheReviewedVersion() {
        val room = service.create(profile())
        val changed = service.update(room.id!!, 0, profile().copy(name = "Updated studio"))
        assertThat(changed.version).isEqualTo(1)
        assertThat(failure { service.update(room.id!!, 0, profile()) }.code)
            .isEqualTo("STALE_VERSION")
        assertThat(failure { service.status(room.id!!, 0, false) }.code).isEqualTo("STALE_VERSION")
        assertThat(failure { service.status(room.id!!, -1, false) }.code)
            .isEqualTo("INVALID_VERSION")
        assertThat(failure { service.update(Int.MAX_VALUE, 0, profile()) }.code)
            .isEqualTo("NOT_FOUND")
        val archived = service.status(room.id!!, changed.version, false)
        val restored = service.status(room.id!!, archived.version, true)
        assertThat(service.status(room.id!!, restored.version, true).version)
            .isEqualTo(restored.version)
        assertThat(restored.name).isEqualTo("Updated studio")
    }

    @Test
    fun capacityAndArchivalConflictsExposeOnlyBoundedReservationIdsAndRetainAllData() {
        val room = service.create(profile())
        val booking = createBooking(room)
        val capacity = failure { service.update(room.id!!, 0, profile(capacity = 2)) }
        assertThat(capacity.code).isEqualTo("CAPACITY_CONFLICT")
        assertThat(capacity.relatedReservationIds).containsExactly(booking.resourceId)
        assertThat(capacity.moreReservations).isFalse()
        val archive = failure { service.status(room.id!!, 0, false) }
        assertThat(archive.code).isEqualTo("ROOM_HAS_BOOKINGS")
        assertThat(service.findApartmentById(room.id!!)!!.capacity).isEqualTo(4)
        assertThat(service.findApartmentById(room.id!!)!!.version).isZero()
        reviewed.change(booking.resourceId, "2099-01-01", "2099-01-04", 2, 0, key())
        assertThat(service.update(room.id!!, 0, profile(capacity = 2)).capacity).isEqualTo(2)
        assertThat(bookings.count()).isEqualTo(1)
    }

    @Test
    fun conflictLinksRemainBoundedWhenManyFutureReservationsNeedResolution() {
        val room = service.create(profile())
        val guest = guest()
        val start = LocalDate.of(2099, 1, 1)
        bookings.saveAllAndFlush(
            (0..20).map { offset ->
                Reservation(
                    customerId = guest.id,
                    roomId = room.id,
                    startDate = start.plusDays(offset * 3L),
                    endDate = start.plusDays(offset * 3L + 2),
                    guestCount = 3,
                )
            }
        )
        val conflict = failure { service.status(room.id!!, 0, false) }
        assertThat(conflict.relatedReservationIds).hasSize(20)
        assertThat(conflict.moreReservations).isTrue()
        assertThat(service.findApartmentById(room.id!!)!!.active).isTrue()
    }

    @Test
    fun movingAStayResolvesRoomArchiveAndRetainedMaintenanceAppliesAgainAfterRestore() {
        val room = service.create(profile())
        val destination = service.create(profile("OTHER"))
        TestData.configureSyntheticRate(jdbc, destination.id!!)
        val booking = createBooking(room)
        reviewed.move(booking.resourceId, destination.id!!, 0, key())
        val block =
            inventory.block(room.id!!, "2099-02-01", "2099-02-03", "Synthetic repair", key())
        val archived = service.status(room.id!!, 0, false)
        assertThat(failure { createBooking(room) }.code).isEqualTo("ROOM_INACTIVE")
        assertThat(
                failure {
                    inventory.block(room.id!!, "2099-03-01", "2099-03-03", "Synthetic", key())
                }
                    .code
            )
            .isEqualTo("ROOM_INACTIVE")
        service.status(room.id!!, archived.version, true)
        assertThat(
                queries
                    .maintenance("2099-02-01", "2099-02-04", null, 0, 10, room.id)
                    .items
                    .single()
                    .id
            )
            .isEqualTo(block.resourceId)
        assertThat(inventory.findAvailableApartments("2099-02-01", "2099-02-03").map { it.id })
            .doesNotContain(room.id)
        assertThat(inventory.reservation(booking.resourceId).roomId).isEqualTo(destination.id)
    }

    @Test
    fun roomWindowQueriesFilterAtTheDatabaseAndRejectMissingOrForeignRooms() {
        val room = service.create(profile())
        val other = service.create(profile("OTHER"))
        val booked = createBooking(room)
        createBooking(other)
        inventory.block(room.id!!, "2099-01-05", "2099-01-07", "Synthetic", key())
        inventory.block(other.id!!, "2099-01-05", "2099-01-07", "Synthetic", key())
        assertThat(
                queries
                    .reservations("2099-01-01", "2099-02-01", null, 0, 1, room.id)
                    .items
                    .single()
                    .id
            )
            .isEqualTo(booked.resourceId)
        assertThat(
                queries
                    .maintenance("2099-01-01", "2099-02-01", null, 0, 1, room.id)
                    .items
                    .single()
                    .roomId
            )
            .isEqualTo(room.id)
        val foreign = rooms.saveAndFlush(Apartment(capacity = 2, propertyId = "other"))
        assertThat(service.findApartmentById(foreign.id!!)).isNull()
        assertThat(
                failure {
                    queries.reservations("2099-01-01", "2099-02-01", null, 0, 10, foreign.id)
                }
                    .code
            )
            .isEqualTo("NOT_FOUND")
        assertThat(failure { service.status(foreign.id!!, 0, false) }.code).isEqualTo("NOT_FOUND")
    }

    @Test
    fun capacityAndArchiveIgnorePastAndCancelledStaysUsingSkopjeToday() {
        val room = service.create(profile())
        val guest = guest()
        bookings.saveAndFlush(
            Reservation(
                customerId = guest.id,
                roomId = room.id,
                startDate = LocalDate.of(2026, 11, 6),
                endDate = LocalDate.of(2026, 11, 7),
                guestCount = 4,
            )
        )
        val cancelled = createBooking(room, 4)
        inventory.cancel(cancelled.resourceId, 0, key())
        val updated = service.update(room.id!!, 0, profile(capacity = 1))
        assertThat(service.status(room.id!!, updated.version, false).active).isFalse()
        assertThat(bookings.count()).isEqualTo(2)
    }

    @ParameterizedTest
    @ValueSource(strings = ["CAPACITY", "ARCHIVE"])
    fun competingBookingAndRoomChangesCannotCommitAnInvalidStay(action: String) {
        val room = service.create(profile())
        TestData.configureSyntheticRate(jdbc, room.id!!)
        val guest = guest()
        val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val actions =
                listOf<() -> Unit>(
                    {
                        if (action == "CAPACITY")
                            service.update(room.id!!, 0, profile(capacity = 2))
                        else service.status(room.id!!, 0, false)
                    },
                    {
                        inventory.create(
                            guest.id!!,
                            room.id!!,
                            "2099-03-01",
                            "2099-03-03",
                            4,
                            key(),
                            quotes.create(room.id!!, "2099-03-01", "2099-03-03", 4).id,
                        )
                    },
                )
            val futures = actions.mapIndexed { index, run ->
                executor.submit<String> {
                    SecurityContextHolder.getContext().authentication =
                        StaffAuthentication(TestData.ownerIdentity(index))
                    try {
                        check(start.await(10, TimeUnit.SECONDS))
                        run()
                        "COMMITTED"
                    } catch (failure: DomainException) {
                        failure.code
                    } finally {
                        SecurityContextHolder.clearContext()
                    }
                }
            }
            start.countDown()
            val outcomes = futures.map { it.get(15, TimeUnit.SECONDS) }
            assertThat(outcomes.count { it == "COMMITTED" }).isEqualTo(1)
            assertThat(outcomes.filter { it != "COMMITTED" }).allMatch {
                it in
                    setOf(
                        "CAPACITY_CONFLICT",
                        "CAPACITY_EXCEEDED",
                        "ROOM_HAS_BOOKINGS",
                        "ROOM_INACTIVE",
                    )
            }
            assertThat(
                    jdbc.queryForObject(
                        "SELECT COUNT(*) FROM reservations r JOIN apartments a ON a.id=r.room_id WHERE r.status='ACTIVE' AND (a.active=FALSE OR r.guest_count>a.capacity)",
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

    @ParameterizedTest
    @ValueSource(strings = ["CREATE", "UPDATE", "ARCHIVE", "RESTORE"])
    fun roomWritesRollBackWhenTheirAuditCannotCommit(action: String) {
        val room = service.create(profile())
        if (action == "RESTORE") service.status(room.id!!, 0, false)
        val before = service.findApartmentById(room.id!!)!!
        jdbc.execute(
            "CREATE OR REPLACE FUNCTION reject_room_audit_fn() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RAISE EXCEPTION 'Synthetic audit failure' USING ERRCODE='45000'; END \$\$; CREATE TRIGGER reject_room_audit BEFORE INSERT ON business_events FOR EACH ROW EXECUTE FUNCTION reject_room_audit_fn()"
        )
        try {
            assertThrows<org.springframework.dao.DataAccessException> {
                when (action) {
                    "CREATE" -> service.create(profile("OTHER"))
                    "UPDATE" ->
                        service.update(room.id!!, before.version, profile().copy(name = "Changed"))
                    "ARCHIVE" -> service.status(room.id!!, before.version, false)
                    else -> service.status(room.id!!, before.version, true)
                }
            }
            assertThat(service.findApartmentById(room.id!!)!!).isEqualTo(before)
            assertThat(rooms.count()).isEqualTo(1)
        } finally {
            jdbc.execute("DROP TRIGGER reject_room_audit ON business_events")
        }
    }

    @Test
    fun allRoomAdministrationRejectsAnUnrecognizedStaffIdentity() {
        val room = service.create(profile())
        SecurityContextHolder.getContext().authentication =
            StaffAuthentication(StaffIdentity(UUID.randomUUID().toString(), 0))
        for (action in
            listOf<() -> Unit>(
                { service.directory(null, true, 0, 10) },
                { service.findApartmentById(room.id!!) },
                { service.create(profile("OTHER")) },
                { service.update(room.id!!, 0, profile()) },
                { service.status(room.id!!, 0, false) },
            )) assertThat(failure(action).code).isEqualTo("SESSION_REVOKED")
    }

    companion object {
        @Container @JvmField val database = TestDatabases.postgres()

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
