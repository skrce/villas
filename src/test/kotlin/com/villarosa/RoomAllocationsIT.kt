package com.villarosa

import com.villarosa.exception.DomainException
import com.villarosa.repository.*
import com.villarosa.repository.model.*
import com.villarosa.service.*
import java.time.Instant
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
class RoomAllocationsIT
@Autowired
constructor(
    private val stays: StayOperations,
    private val readiness: ReadinessService,
    private val inventory: ReservationService,
    private val allocations: RoomAllocations,
    private val calendar: BookingCalendar,
    private val queries: InventoryQueries,
    private val quotes: QuoteService,
    private val rooms: ApartmentRepository,
    private val guests: CustomerRepository,
    private val clock: MutablePriceClock,
    private val jdbc: JdbcTemplate,
) {
    private lateinit var a: Apartment
    private lateinit var b: Apartment
    private var guest = 0

    private fun key() = UUID.randomUUID().toString()

    @BeforeEach
    fun fixtures() {
        TestData.reset(jdbc, database.jdbcUrl)
        clock.value = Instant.parse("2026-11-06T12:00:00Z")
        a =
            rooms.saveAndFlush(
                Apartment(
                    capacity = 4,
                    name = "Synthetic first",
                    reference = "AL-A",
                    baseRateCents = 5001,
                )
            )
        b =
            rooms.saveAndFlush(
                Apartment(
                    capacity = 4,
                    name = "Synthetic second",
                    reference = "AL-B",
                    baseRateCents = 6001,
                )
            )
        guest = guests.saveAndFlush(Customer(firstName = "Synthetic", lastName = "Allocation")).id!!
    }

    private fun book(
        room: Apartment,
        start: String = "2026-11-07",
        end: String = "2026-11-10",
    ): Int {
        val quote = quotes.create(room.id!!, start, end, 2)
        return inventory.createQuoted(guest, quote.id, room.id!!, start, end, 2, key()).resourceId
    }

    private fun clean(room: Apartment): Long {
        var v = readiness.read(room.id!!).version
        readiness.change(room.id!!, ReadinessState.IN_PROGRESS, v++, key(), null)
        readiness.change(room.id!!, ReadinessState.INSPECTION, v++, key(), null)
        return readiness.change(room.id!!, ReadinessState.CLEAN, v, key(), null).readiness!!.version
    }

    private fun arrive(id: Int, room: Apartment) =
        stays.checkIn(id, inventory.reservation(id).version, clean(room), key())

    private fun move(id: Int, room: Apartment): OperationResult {
        val booking = inventory.reservation(id)
        val quote =
            quotes.create(room.id!!, booking.startDate!!, booking.endDate!!, booking.guestCount)
        return stays.move(
            id,
            room.id!!,
            booking.version,
            quote.id,
            readiness.read(room.id!!).version,
            "Synthetic physical move",
            key(),
        )
    }

    @Test
    fun anInHouseMoveUsesOnlyRemainingDestinationNightsAndRetainsTheEarlierRoom() {
        val earlier = book(b, "2026-11-06", "2026-11-08")
        arrive(earlier, b)
        clock.value = Instant.parse("2026-11-07T12:00:00Z")
        val current = book(a)
        arrive(current, a)
        clock.value = Instant.parse("2026-11-08T10:00:00Z")
        stays.checkOut(earlier, inventory.reservation(earlier).version, true, null, key())
        clean(b)
        clock.value = Instant.parse("2026-11-08T12:00:00Z")
        val moved = move(current, b)
        assertThat(moved.reservation!!.roomId).isEqualTo(b.id)
        val saved = allocations.page(current, "0", 100, null)
        assertThat(saved.items.map { Triple(it.roomId, it.startDate, it.endDate) })
            .containsExactly(
                Triple(a.id!!, "2026-11-07", "2026-11-08"),
                Triple(b.id!!, "2026-11-08", "2026-11-10"),
            )
        assertThat(quotes.currentPrice(current)!!.quote.price.totalCents).isEqualTo(18003)
        assertThat(quotes.history(current, null, 100).items.map { it.quote.price.totalCents })
            .containsExactly(18003, 15003)
        val week = calendar.read("2026-11-06", "2026-11-11", 0, 50, false)
        assertThat(
                week.stays
                    .filter { it.id == current }
                    .map { Triple(it.roomId, it.startDate, it.endDate) }
            )
            .containsExactly(
                Triple(a.id!!, "2026-11-07", "2026-11-08"),
                Triple(b.id!!, "2026-11-08", "2026-11-10"),
            )
        assertThat(week.stays.map { it.allocationId }.toSet()).hasSize(3)
        assertThat(inventory.findAvailableApartments("2026-11-08", "2026-11-10", 2).map { it.id })
            .contains(a.id)
            .doesNotContain(b.id)
    }

    @Test
    fun repeatedSameDayMovesKeepPositiveNightRangesAndOneCurrentPhysicalRoom() {
        clock.value = Instant.parse("2026-11-07T12:00:00Z")
        val id = book(a)
        arrive(id, a)
        clean(b)
        clock.value = Instant.parse("2026-11-08T12:00:00Z")
        move(id, b)
        clean(a)
        move(id, a)
        assertThat(
                allocations.page(id, "0", 100, null).items.map {
                    Triple(it.roomId, it.startDate, it.endDate)
                }
            )
            .containsExactly(Triple(a.id!!, "2026-11-07", "2026-11-10"))
        assertThat(readiness.read(b.id!!).state).isEqualTo(ReadinessState.DIRTY)
        assertThat(readiness.read(a.id!!).state).isEqualTo(ReadinessState.CLEAN)
    }

    @Test
    fun dateChangesAfterAMovePreservePastRoomNightsAndCheckExtendedNights() {
        clock.value = Instant.parse("2026-11-07T12:00:00Z")
        val id = book(a)
        arrive(id, a)
        clean(b)
        clock.value = Instant.parse("2026-11-08T12:00:00Z")
        move(id, b)
        val occupied = book(b, "2026-11-10", "2026-11-11")
        val offer = quotes.create(b.id!!, "2026-11-07", "2026-11-11", 2)
        assertThat(
                assertThrows<DomainException> {
                        stays.change(
                            id,
                            offer.startDate,
                            offer.endDate,
                            2,
                            inventory.reservation(id).version,
                            offer.id,
                            "Synthetic extension",
                            key(),
                        )
                    }
                    .code
            )
            .isEqualTo("INVENTORY_CONFLICT")
        inventory.cancel(occupied, inventory.reservation(occupied).version, key())
        stays.change(
            id,
            offer.startDate,
            offer.endDate,
            2,
            inventory.reservation(id).version,
            offer.id,
            "Synthetic extension",
            key(),
        )
        assertThat(
                allocations.page(id, "0", 100, null).items.map {
                    Triple(it.roomId, it.startDate, it.endDate)
                }
            )
            .containsExactly(
                Triple(a.id!!, "2026-11-07", "2026-11-08"),
                Triple(b.id!!, "2026-11-08", "2026-11-11"),
            )
    }

    @Test
    fun aMoveOnDepartureDayCanBeExtendedLaterWithoutLosingItsEffectiveRoomDate() {
        clock.value = Instant.parse("2026-11-07T12:00:00Z")
        val id = book(a, "2026-11-07", "2026-11-08")
        arrive(id, a)
        clean(b)
        clock.value = Instant.parse("2026-11-08T10:00:00Z")
        move(id, b)
        assertThat(allocations.page(id, "0", 100, null).items.single().roomId).isEqualTo(a.id)
        clock.value = Instant.parse("2026-11-09T10:00:00Z")
        val offer = quotes.create(b.id!!, "2026-11-07", "2026-11-10", 2)
        stays.change(
            id,
            offer.startDate,
            offer.endDate,
            2,
            inventory.reservation(id).version,
            offer.id,
            "Synthetic late extension",
            key(),
        )
        assertThat(
                allocations.page(id, "0", 100, null).items.map {
                    Triple(it.roomId, it.startDate, it.endDate)
                }
            )
            .containsExactly(
                Triple(a.id!!, "2026-11-07", "2026-11-08"),
                Triple(b.id!!, "2026-11-08", "2026-11-10"),
            )
    }

    @Test
    fun failedMoveRollsBackAllocationsReadinessVersionPriceAndOperationIdentity() {
        clock.value = Instant.parse("2026-11-07T12:00:00Z")
        val id = book(a)
        arrive(id, a)
        clean(b)
        clock.value = Instant.parse("2026-11-08T12:00:00Z")
        val before = allocations.page(id, "0", 100, null)
        val offer = quotes.create(b.id!!, "2026-11-07", "2026-11-10", 2)
        val stable = key()
        jdbc.execute(
            "CREATE OR REPLACE FUNCTION synthetic_allocation_failure_fn() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RAISE EXCEPTION 'Synthetic allocation failure' USING ERRCODE='45000'; END \$\$; CREATE TRIGGER synthetic_allocation_failure BEFORE INSERT ON inventory_events FOR EACH ROW EXECUTE FUNCTION synthetic_allocation_failure_fn()"
        )
        try {
            assertThrows<RuntimeException> {
                stays.move(
                    id,
                    b.id!!,
                    before.reservationVersion,
                    offer.id,
                    3,
                    "Synthetic physical move",
                    stable,
                )
            }
        } finally {
            jdbc.execute("DROP TRIGGER synthetic_allocation_failure ON inventory_events")
        }
        assertThat(allocations.page(id, "0", 100, null)).isEqualTo(before)
        assertThat(readiness.read(a.id!!).state).isEqualTo(ReadinessState.CLEAN)
        assertThat(readiness.read(b.id!!).state).isEqualTo(ReadinessState.CLEAN)
        assertThat(quotes.history(id, null, 100).items).hasSize(1)
        assertThat(
                jdbc.queryForObject(
                    "SELECT COUNT(*) FROM inventory_operations WHERE operation_key=?",
                    Long::class.java,
                    stable,
                )
            )
            .isZero()
        stays.move(
            id,
            b.id!!,
            before.reservationVersion,
            offer.id,
            3,
            "Synthetic physical move",
            stable,
        )
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
