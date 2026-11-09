package com.villarosa

import com.villarosa.exception.DomainException
import com.villarosa.exception.ExceptionHandler.ClientException
import com.villarosa.repository.*
import com.villarosa.repository.model.*
import com.villarosa.security.StaffAuthentication
import com.villarosa.service.*
import java.time.LocalDate
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.ArgumentMatchers.anyBoolean
import org.mockito.ArgumentMatchers.anyInt
import org.mockito.Mockito.doAnswer
import org.mockito.Mockito.reset
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@ActiveProfiles("test")
@Testcontainers
class BookingCalendarIT
@Autowired
constructor(
    private val calendar: BookingCalendar,
    private val service: ReservationService,
    private val quotes: QuoteService,
    private val rooms: ApartmentRepository,
    private val guests: CustomerRepository,
    private val reservations: ReservationRepository,
    private val jdbc: JdbcTemplate,
) {
    @MockitoSpyBean private lateinit var store: CalendarStore
    private lateinit var room: Apartment
    private lateinit var guest: Customer

    private fun key() = UUID.randomUUID().toString()

    @BeforeEach
    fun fixtures() {
        reset(store)
        TestData.reset(jdbc, database.jdbcUrl)
        room =
            rooms.saveAndFlush(
                Apartment(
                    null,
                    4,
                    "South",
                    "Lake",
                    100,
                    150,
                    name = "Lake room",
                    reference = "LAKE",
                    baseRateCents = 5001,
                    rateVersion = 1,
                )
            )
        guest =
            guests.saveAndFlush(
                Customer.buildCustomer("Synthetic", "Calendar", "+389000", "Private address")
            )
    }

    private fun create(start: String, end: String) =
        service.create(
            guest.id!!,
            room.id!!,
            start,
            end,
            2,
            key(),
            quotes.create(room.id!!, start, end, 2).id,
        )

    @Test
    fun calendarUsesHalfOpenDatesAndOnlyActiveOccupancy() {
        create("2030-01-01", "2030-01-03")
        val visible = create("2030-01-03", "2030-01-05")
        val cancelled = create("2030-01-05", "2030-01-07")
        service.cancel(cancelled.resourceId, 0, key())
        val block = service.block(room.id!!, "2030-01-05", "2030-01-07", "Synthetic repair", key())
        val page = calendar.read("2030-01-03", "2030-01-07", 0, 20, false)
        assertThat(page.rooms.single().name).isEqualTo("Lake room")
        assertThat(page.stays.map { it.id }).containsExactly(visible.resourceId)
        assertThat(page.stays.single().guestName).isEqualTo("Synthetic Calendar")
        assertThat(page.maintenance.map { it.id }).containsExactly(block.resourceId)
        service.unblock(block.resourceId, 0, key())
        assertThat(calendar.read("2030-01-05", "2030-01-07", 0, 20, false).stays).isEmpty()
        assertThat(calendar.read("2030-01-05", "2030-01-07", 0, 20, false).maintenance).isEmpty()
    }

    @Test
    fun roomPagesAreExclusiveScopedAndArchivedRoomsAreExplicit() {
        val archived =
            rooms.saveAndFlush(
                room.copy(id = null, name = "Archived", reference = "OLD", active = false)
            )
        rooms.saveAndFlush(room.copy(id = null, propertyId = "other", reference = "OTHER"))
        val page = calendar.read("2030-01-01", "2030-01-08", 0, 1, true)
        assertThat(page.rooms.map { it.id }).containsExactly(room.id!!)
        assertThat(page.nextRoomCursor).isEqualTo(room.id)
        val next = calendar.read("2030-01-01", "2030-01-08", page.nextRoomCursor!!, 1, true)
        assertThat(next.rooms.map { it.id }).containsExactly(archived.id!!)
        assertThat(next.nextRoomCursor).isNull()
        assertThat(calendar.read("2030-01-01", "2030-01-08", 0, 50, false).rooms).hasSize(1)
        assertThat(calendar.read("2030-01-01", "2030-01-08", archived.id!!, 50, true).rooms)
            .isEmpty()
    }

    @Test
    fun otherPropertyReservationsNeverOccupyThisCalendar() {
        val otherGuest = guests.saveAndFlush(guest.copy(id = null, propertyId = "other"))
        val otherRoom =
            rooms.saveAndFlush(room.copy(id = null, propertyId = "other", reference = "OTHER"))
        reservations.saveAndFlush(
            Reservation(
                null,
                otherGuest.id,
                otherRoom.id,
                LocalDate.parse("2030-01-01"),
                LocalDate.parse("2030-01-04"),
                propertyId = "other",
            )
        )
        assertThat(calendar.read("2030-01-01", "2030-01-08", 0, 20, true).stays).isEmpty()
    }

    @Test
    fun calendarRejectsUnboundedOrInvalidRequests() {
        for (run in
            listOf<() -> Unit>(
                { calendar.read("2030-01-01", "2030-02-02", 0, 20, false) },
                { calendar.read("2030-01-01", "2030-01-08", -1, 20, false) },
                { calendar.read("2030-01-01", "2030-01-08", 0, 51, false) },
                { calendar.read("2030-01-01", "2030-01-08", 0, 0, false) },
            )) assertThrows<DomainException> { run() }
        assertThrows<ClientException> { calendar.read("2030-02-30", "2030-03-03", 0, 20, false) }
        assertThrows<ClientException> { calendar.read("2030-01-01", "2030-01-01", 0, 20, false) }
        assertThat(calendar.read("2030-01-01", "2030-02-01", 0, 50, false).rooms).hasSize(1)
    }

    @Test
    fun snapshotDoesNotLoseAStayMovedBetweenReads() {
        val original = create("2030-01-01", "2030-01-04")
        val pool = Executors.newSingleThreadExecutor()
        try {
            doAnswer { invocation ->
                    val result = invocation.callRealMethod()
                    pool
                        .submit {
                            SecurityContextHolder.getContext().authentication =
                                StaffAuthentication(TestData.ownerIdentity())
                            try {
                                service.cancel(original.resourceId, 0, key())
                            } finally {
                                SecurityContextHolder.clearContext()
                            }
                        }
                        .get(10, TimeUnit.SECONDS)
                    result
                }
                .`when`(store)
                .rooms(anyInt(), anyInt(), anyBoolean())
            val snapshot = calendar.read("2030-01-01", "2030-01-08", 0, 20, false)
            assertThat(snapshot.stays.map { it.id }).containsExactly(original.resourceId)
            reset(store)
            assertThat(calendar.read("2030-01-01", "2030-01-08", 0, 20, false).stays).isEmpty()
        } finally {
            pool.shutdownNow()
        }
    }

    @Test
    fun tooManyEventsFailsInsteadOfTruncatingFreeTime() {
        jdbc.batchUpdate(
            "INSERT INTO reservations (customer_id,room_id,start_date,end_date,guest_count,status,version,property_id) VALUES (?,?,'2030-01-01','2030-01-02',1,'ACTIVE',0,'villa-rosa')",
            (0..CalendarStore.MAX_EVENTS).map { arrayOf<Any>(guest.id!!, room.id!!) },
        )
        assertThat(
                assertThrows<DomainException> {
                        calendar.read("2030-01-01", "2030-01-08", 0, 20, false)
                    }
                    .code
            )
            .isEqualTo("CALENDAR_INCOMPLETE")
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
