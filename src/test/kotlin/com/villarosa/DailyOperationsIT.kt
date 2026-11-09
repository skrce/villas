package com.villarosa

import com.villarosa.exception.DomainException
import com.villarosa.repository.*
import com.villarosa.repository.model.*
import com.villarosa.service.*
import java.time.Instant
import java.time.LocalDate
import java.util.TimeZone
import java.util.UUID
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@ActiveProfiles("test")
@Import(PriceClockConfiguration::class)
@Testcontainers
class DailyOperationsIT
@Autowired
constructor(
    private val daily: DailyOperations,
    private val readiness: ReadinessService,
    private val inventory: ReservationService,
    private val rooms: ApartmentRepository,
    private val guests: CustomerRepository,
    private val reservations: ReservationRepository,
    private val clock: MutablePriceClock,
    private val jdbc: JdbcTemplate,
    private val json: tools.jackson.databind.ObjectMapper,
) {
    private lateinit var room: Apartment
    private var guest = 0
    private val today = LocalDate.parse("2026-11-07")

    private fun key() = UUID.randomUUID().toString()

    @BeforeEach
    fun fixtures() {
        TestData.reset(jdbc, database.jdbcUrl)
        clock.value = Instant.parse("2026-11-06T23:30:00.123456Z")
        room =
            rooms.saveAndFlush(
                Apartment(capacity = 4, name = "Synthetic operations", reference = "OPS-1")
            )
        guest =
            guests
                .saveAndFlush(
                    Customer(
                        firstName = "PrivateSynthetic",
                        lastName = "Guest",
                        phone = "000123456",
                        notes = "Private synthetic note",
                    )
                )
                .id!!
    }

    private fun stay(phase: StayPhase, start: LocalDate, end: LocalDate) =
        reservations.saveAndFlush(
            Reservation(
                customerId = guest,
                roomId = room.id,
                startDate = start,
                endDate = end,
                status =
                    if (phase in setOf(StayPhase.CANCELLED, StayPhase.NO_SHOW))
                        ReservationStatus.CANCELLED
                    else ReservationStatus.ACTIVE,
                phase = phase,
                checkedInAt =
                    if (phase in setOf(StayPhase.CHECKED_IN, StayPhase.CHECKED_OUT))
                        start.atTime(12, 0).toInstant(java.time.ZoneOffset.UTC)
                    else null,
                checkedOutAt =
                    if (phase == StayPhase.CHECKED_OUT)
                        end.atTime(12, 0).toInstant(java.time.ZoneOffset.UTC)
                    else null,
            )
        )

    @Test
    fun housekeepingUsesDefaultReadinessAndDatedMaintenanceWithoutGuestOrFinancialFields() {
        stay(StayPhase.CONFIRMED, today, today.plusDays(2))
        inventory.block(
            room.id!!,
            today.plusDays(3).toString(),
            today.plusDays(4).toString(),
            "Synthetic room inspection",
            key(),
        )
        inventory.block(
            room.id!!,
            today.plusDays(7).toString(),
            today.plusDays(8).toString(),
            "Outside window",
            key(),
        )
        val page = daily.housekeeping(0, 50, null, null)
        assertThat(page.propertyDate).isEqualTo(today.toString())
        assertThat(page.maintenanceUntil).isEqualTo(today.plusDays(7).toString())
        val item = page.rooms.single()
        assertThat(item.occupied).isFalse()
        assertThat(item.readiness)
            .isEqualTo(ReadinessView(room.id!!, ReadinessState.DIRTY, 0, null))
        assertThat(item.maintenance.single().reason).isEqualTo("Synthetic room inspection")
        assertThat(json.writeValueAsString(page))
            .doesNotContain(
                "PrivateSynthetic",
                "000123456",
                "Private synthetic note",
                "customerId",
                "amountCents",
                "acceptedQuoteId",
            )
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM room_readiness", Long::class.java))
            .isZero()
    }

    @Test
    fun arrivalsDeparturesInHouseAndAttentionRespectThePhysicalPhase() {
        val arrival = stay(StayPhase.CONFIRMED, today, today.plusDays(1))
        val departure = stay(StayPhase.CHECKED_IN, today.minusDays(2), today)
        val completed = stay(StayPhase.CHECKED_OUT, today.minusDays(3), today)
        val lateArrival = stay(StayPhase.CONFIRMED, today.minusDays(1), today.plusDays(1))
        val overdue = stay(StayPhase.CHECKED_IN, today.minusDays(4), today.minusDays(1))
        stay(StayPhase.CANCELLED, today, today.plusDays(1))
        stay(StayPhase.NO_SHOW, today.minusDays(1), today)
        assertThat(daily.desk(FrontDeskList.ARRIVALS, 0, 50, null).items.map { it.reservation.id })
            .containsExactly(arrival.id)
        assertThat(
                daily.desk(FrontDeskList.DEPARTURES, 0, 50, null).items.map { it.reservation.id }
            )
            .containsExactly(departure.id, completed.id)
        assertThat(daily.desk(FrontDeskList.IN_HOUSE, 0, 50, null).items.map { it.reservation.id })
            .containsExactly(departure.id, overdue.id)
        assertThat(daily.desk(FrontDeskList.ATTENTION, 0, 50, null).items.map { it.reservation.id })
            .containsExactly(lateArrival.id, overdue.id)
        assertThat(daily.housekeeping(0, 50, null, null).rooms.single().occupied).isTrue()
        assertThat(
                daily
                    .desk(FrontDeskList.IN_HOUSE, 0, 50, null)
                    .items
                    .first()
                    .reservation
                    .checkedInAt
            )
            .endsWith("Z")
    }

    @Test
    fun housekeepingFiltersPaginateByRoomWithoutWritingOrLosingOccupiedRooms() {
        val second =
            rooms.saveAndFlush(
                Apartment(capacity = 2, name = "Synthetic second", reference = "OPS-2")
            )
        rooms.saveAndFlush(
            Apartment(
                capacity = 2,
                name = "Synthetic archived",
                reference = "OPS-3",
                active = false,
            )
        )
        readiness.change(room.id!!, ReadinessState.IN_PROGRESS, 0, key(), null)
        assertThat(daily.housekeeping(0, 50, ReadinessState.DIRTY, null).rooms.single().roomId)
            .isEqualTo(second.id)
        assertThat(daily.housekeeping(0, 50, ReadinessState.CLEAN, null).rooms).isEmpty()
        val first = daily.housekeeping(0, 1, null, null)
        assertThat(first.rooms.single().roomId).isEqualTo(room.id)
        assertThat(first.nextCursor).isEqualTo(room.id)
        assertThat(
                daily
                    .housekeeping(first.nextCursor!!, 1, null, first.propertyDate)
                    .rooms
                    .single()
                    .roomId
            )
            .isEqualTo(second.id)
        assertThat(daily.housekeeping(second.id!!, 1, null, first.propertyDate).rooms).isEmpty()
    }

    @Test
    fun frontDeskPagesNeverMixPropertyDaysAcrossMidnightOrDaylightSaving() {
        val first = stay(StayPhase.CONFIRMED, today, today.plusDays(1))
        val second = stay(StayPhase.CONFIRMED, today, today.plusDays(2))
        val page = daily.desk(FrontDeskList.ARRIVALS, 0, 1, null)
        assertThat(page.items.single().reservation.id).isEqualTo(first.id)
        assertThat(page.nextCursor).isEqualTo(first.id)
        assertThat(
                daily
                    .desk(FrontDeskList.ARRIVALS, first.id!!, 1, page.propertyDate)
                    .items
                    .single()
                    .reservation
                    .id
            )
            .isEqualTo(second.id)
        clock.value = Instant.parse("2026-11-07T23:00:00Z")
        assertThat(
                assertThrows<DomainException> {
                        daily.desk(FrontDeskList.ARRIVALS, first.id!!, 1, page.propertyDate)
                    }
                    .code
            )
            .isEqualTo("PROPERTY_DATE_CHANGED")
        assertThat(
                assertThrows<DomainException> { daily.housekeeping(0, 50, null, page.propertyDate) }
                    .code
            )
            .isEqualTo("PROPERTY_DATE_CHANGED")
        assertThat(daily.desk(FrontDeskList.ARRIVALS, 0, 50, null).propertyDate)
            .isEqualTo("2026-11-08")
        clock.value = Instant.parse("2026-06-05T22:00:00Z")
        assertThat(daily.housekeeping(0, 50, null, null).propertyDate).isEqualTo("2026-06-06")
    }

    @Test
    fun propertyScopeCurrentMembershipAndBoundsApplyToBothLists() {
        TestData.registerBusiness(jdbc, "foreign")
        val foreignRoom = rooms.saveAndFlush(room.copy(id = null, propertyId = "foreign"))
        val foreignGuest =
            guests.saveAndFlush(
                Customer(firstName = "Foreign", lastName = "Synthetic", propertyId = "foreign")
            )
        reservations.saveAndFlush(
            Reservation(
                propertyId = "foreign",
                customerId = foreignGuest.id,
                roomId = foreignRoom.id,
                startDate = today,
                endDate = today.plusDays(1),
            )
        )
        assertThat(daily.desk(FrontDeskList.ARRIVALS, 0, 50, null).items).isEmpty()
        assertThat(daily.housekeeping(0, 50, null, null).rooms.map { it.roomId })
            .containsExactly(room.id)
        for ((after, limit) in listOf(-1 to 50, 0 to 0, 0 to 51)) {
            assertThrows<DomainException> { daily.desk(FrontDeskList.ARRIVALS, after, limit, null) }
            assertThrows<DomainException> { daily.housekeeping(after, limit, null, null) }
        }
        jdbc.update(
            "UPDATE staff_accounts SET active=FALSE WHERE id=?",
            TestData.ownerIdentity().id,
        )
        assertThrows<RuntimeException> { daily.desk(FrontDeskList.ARRIVALS, 0, 50, null) }
        assertThrows<RuntimeException> { daily.housekeeping(0, 50, null, null) }
    }

    @Test
    fun readinessAndActualTimesStayUtcOnNonUtcJvmReads() {
        val original = TimeZone.getDefault()
        try {
            TimeZone.setDefault(TimeZone.getTimeZone("America/New_York"))
            val saved = readiness.change(room.id!!, ReadinessState.IN_PROGRESS, 0, key(), null)
            assertThat(daily.housekeeping(0, 50, null, null).rooms.single().readiness.changedAt)
                .isEqualTo(saved.readiness!!.changedAt)
            val booking = stay(StayPhase.CHECKED_IN, today, today.plusDays(1))
            assertThat(
                    daily
                        .desk(FrontDeskList.IN_HOUSE, 0, 50, null)
                        .items
                        .single()
                        .reservation
                        .checkedInAt
                )
                .isEqualTo(booking.checkedInAt!!.toString())
        } finally {
            TimeZone.setDefault(original)
        }
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
