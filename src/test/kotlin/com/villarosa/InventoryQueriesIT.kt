package com.villarosa

import com.villarosa.exception.DomainException
import com.villarosa.exception.ExceptionHandler.ClientException
import com.villarosa.repository.*
import com.villarosa.repository.model.*
import com.villarosa.service.InventoryQueries
import com.villarosa.service.QuoteService
import com.villarosa.service.ReservationService
import jakarta.persistence.EntityManagerFactory
import java.time.LocalDate
import java.util.UUID
import org.assertj.core.api.Assertions.assertThat
import org.hibernate.SessionFactory
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@ActiveProfiles("test")
@Testcontainers
class InventoryQueriesIT
@Autowired
constructor(
    private val queries: InventoryQueries,
    private val service: ReservationService,
    private val quotes: QuoteService,
    private val rooms: ApartmentRepository,
    private val guests: CustomerRepository,
    private val reservations: ReservationRepository,
    private val jdbc: JdbcTemplate,
    private val transactionManager: org.springframework.transaction.PlatformTransactionManager,
    private val factory: EntityManagerFactory,
) {
    private val reviewed = ReviewedChanges(service, quotes, transactionManager)
    private lateinit var guest: Customer
    private lateinit var room: Apartment

    private fun key() = UUID.randomUUID().toString()

    @BeforeEach
    fun fixtures() {
        TestData.reset(jdbc, database.jdbcUrl)
        guest = guests.saveAndFlush(Customer.buildCustomer("Query", "Гостин", "000", "Synthetic"))
        room =
            rooms.saveAndFlush(
                Apartment(
                    null,
                    2,
                    "South",
                    "Езеро",
                    100,
                    150,
                    baseRateCents = 5001,
                    rateVersion = 1,
                )
            )
    }

    private fun create(start: String, end: String) =
        service.create(
            guest.id!!,
            room.id!!,
            start,
            end,
            1,
            key(),
            quotes.create(room.id!!, start, end, 1).id,
        )

    @Test
    fun calendarPagesUseExclusiveCursorsAndKeepCancelledHistory() {
        val first = create("2026-11-01", "2026-11-03")
        val second = create("2026-11-03", "2026-11-05")
        val third = create("2026-11-05", "2026-11-07")
        service.cancel(second.resourceId, 0, key())
        val page = queries.reservations("2026-11-01", "2026-11-08", null, 0, 2)
        assertThat(page.items.map { it.id }).containsExactly(first.resourceId, second.resourceId)
        assertThat(page.nextCursor).isEqualTo(second.resourceId)
        val next = queries.reservations("2026-11-01", "2026-11-08", null, page.nextCursor!!, 2)
        assertThat(next.items.map { it.id }).containsExactly(third.resourceId)
        assertThat(next.nextCursor).isNull()
        assertThat(
                queries
                    .reservations("2026-11-01", "2026-11-08", ReservationStatus.ACTIVE, 0, 10)
                    .items
                    .map { it.id }
            )
            .containsExactly(first.resourceId, third.resourceId)
        assertThat(
                queries
                    .reservations("2026-11-01", "2026-11-08", ReservationStatus.CANCELLED, 0, 10)
                    .items
                    .map { it.id }
            )
            .containsExactly(second.resourceId)
        val exact = queries.reservations("2026-11-03", "2026-11-05", null, 0, 10)
        assertThat(exact.items.map { it.id }).containsExactly(second.resourceId)
    }

    @Test
    fun maintenancePagesUseTheSameHalfOpenCalendarAndStatusFilters() {
        val one = service.block(room.id!!, "2026-11-01", "2026-11-03", "Synthetic", key())
        val two = service.block(room.id!!, "2026-11-03", "2026-11-05", "Synthetic", key())
        service.unblock(two.resourceId, 0, key())
        val page = queries.maintenance("2026-11-01", "2026-11-06", null, 0, 1)
        assertThat(page.items.map { it.id }).containsExactly(one.resourceId)
        assertThat(page.nextCursor).isEqualTo(one.resourceId)
        val next = queries.maintenance("2026-11-01", "2026-11-06", null, page.nextCursor!!, 1)
        assertThat(next.items.map { it.id }).containsExactly(two.resourceId)
        assertThat(next.nextCursor).isNull()
        assertThat(
                queries
                    .maintenance("2026-11-03", "2026-11-05", ReservationStatus.ACTIVE, 0, 1)
                    .items
            )
            .isEmpty()
        assertThat(queries.maintenance("2026-11-05", "2026-11-07", null, 0, 1).items).isEmpty()
    }

    @Test
    fun eventPagesKeepVersionsAndUtcInstantsWithoutGuestContacts() {
        val booking = create("2026-11-01", "2026-11-03")
        reviewed.change(booking.resourceId, "2026-11-01", "2026-11-04", 2, 0, key())
        service.cancel(booking.resourceId, 1, key())
        val first = queries.reservationEvents(booking.resourceId, "0", 2)
        assertThat(first.items.map { it.kind }).containsExactly("CREATED", "CHANGED")
        assertThat(first.items.map { it.resourceVersion }).containsExactly(0, 1)
        assertThat(first.items).allMatch {
            it.id.toLong() > 0 && it.occurredAt.toString().endsWith("Z")
        }
        val last = queries.reservationEvents(booking.resourceId, first.nextCursor!!, 2)
        assertThat(last.items.map { it.kind }).containsExactly("CANCELLED")
        assertThat(last.nextCursor).isNull()
        val block = service.block(room.id!!, "2026-11-05", "2026-11-07", "Synthetic", key())
        service.unblock(block.resourceId, 0, key())
        val history = queries.maintenanceEvents(block.resourceId, "0", 1)
        assertThat(history.items.map { it.kind }).containsExactly("BLOCKED")
        assertThat(
                queries.maintenanceEvents(block.resourceId, history.nextCursor!!, 1).items.map {
                    it.kind
                }
            )
            .containsExactly("UNBLOCKED")
    }

    @Test
    fun guestListsAndCalendarPagesLimitEntityLoadsInTheDatabase() {
        val start = LocalDate.parse("2026-01-01")
        jdbc.batchUpdate(
            *(0 until 105)
                .map { n ->
                    "INSERT INTO reservations (customer_id, room_id, start_date, end_date) VALUES (${guest.id}, ${room.id}, '${start.plusDays(n.toLong())}', '${start.plusDays(n + 1L)}')"
                }
                .toTypedArray()
        )
        val statistics = factory.unwrap(SessionFactory::class.java).statistics
        statistics.isStatisticsEnabled = true
        try {
            statistics.clear()
            val list = service.findReservationsByCustomer(guest.id!!)
            assertThat(list).hasSize(100)
            assertThat(list.first().startDate).isEqualTo(start.plusDays(104).toString())
            assertThat(list.last().startDate).isEqualTo(start.plusDays(5).toString())
            assertThat(statistics.getEntityStatistics(Reservation::class.java.name).loadCount)
                .isEqualTo(100)
            statistics.clear()
            val page = queries.reservations("2026-01-01", "2027-01-01", null, 0, 2)
            assertThat(page.items).hasSize(2)
            assertThat(page.nextCursor).isNotNull()
            assertThat(statistics.getEntityStatistics(Reservation::class.java.name).loadCount)
                .isEqualTo(3)
        } finally {
            statistics.isStatisticsEnabled = false
        }
    }

    @Test
    fun invalidBoundsAndMissingSubjectsAreRejected() {
        for (limit in listOf(0, -1, 201)) {
            assertThat(
                    assertThrows<DomainException> {
                            queries.reservations("2026-11-01", "2026-11-03", null, 0, limit)
                        }
                        .code
                )
                .isEqualTo("INVALID_PAGE_SIZE")
        }
        assertThat(
                assertThrows<DomainException> {
                        queries.maintenance("2026-11-01", "2026-11-03", null, -1, 1)
                    }
                    .code
            )
            .isEqualTo("INVALID_CURSOR")
        assertThat(
                assertThrows<DomainException> {
                        queries.reservations("2026-01-01", "2027-01-03", null, 0, 1)
                    }
                    .code
            )
            .isEqualTo("INVALID_QUERY_WINDOW")
        assertThrows<ClientException> {
            queries.reservations("2026-02-30", "2026-03-02", null, 0, 1)
        }
        assertThat(queries.reservations("2026-01-01", "2027-01-02", null, 0, 200).items).isEmpty()
        assertThat(assertThrows<DomainException> { queries.reservationEvents(999999, "0", 1) }.code)
            .isEqualTo("NOT_FOUND")
        assertThat(assertThrows<DomainException> { queries.maintenanceEvents(999999, "0", 1) }.code)
            .isEqualTo("NOT_FOUND")
        val booking = create("2026-11-01", "2026-11-03")
        for (cursor in listOf("-1", "1.5", "01", "x", "9223372036854775808")) {
            assertThat(
                    assertThrows<DomainException> {
                            queries.reservationEvents(booking.resourceId, cursor, 1)
                        }
                        .code
                )
                .isEqualTo("INVALID_CURSOR")
        }
    }

    @Test
    fun calendarAndHistoryQueriesRemainPropertyScoped() {
        val otherGuest = guests.saveAndFlush(guest.copy(id = null, propertyId = "other"))
        val otherRoom = rooms.saveAndFlush(room.copy(id = null, propertyId = "other"))
        val other =
            reservations.saveAndFlush(
                Reservation(
                    null,
                    otherGuest.id,
                    otherRoom.id,
                    LocalDate.parse("2026-11-01"),
                    LocalDate.parse("2026-11-03"),
                    propertyId = "other",
                )
            )
        assertThat(queries.reservations("2026-11-01", "2026-11-03", null, 0, 1).items).isEmpty()
        assertThat(
                assertThrows<DomainException> { queries.reservationEvents(other.id!!, "0", 1) }.code
            )
            .isEqualTo("NOT_FOUND")
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
            registry.add("spring.session.jdbc.initialize-schema") { "never" }
            registry.add("spring.datasource.url", database::getJdbcUrl)
            registry.add("spring.datasource.username", database::getUsername)
            registry.add("spring.datasource.password", database::getPassword)
            registry.add("spring.datasource.driver-class-name", database::getDriverClassName)
            registry.add("spring.jpa.hibernate.ddl-auto") { "validate" }
        }
    }
}
