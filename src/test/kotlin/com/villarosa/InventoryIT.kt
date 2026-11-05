package com.villarosa

import com.villarosa.exception.DomainException
import com.villarosa.repository.*
import com.villarosa.repository.model.*
import com.villarosa.service.ReservationService
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.assertj.core.api.Assertions.assertThat
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
class InventoryIT
@Autowired
constructor(
    private val service: ReservationService,
    private val rooms: ApartmentRepository,
    private val guests: CustomerRepository,
    private val reservations: ReservationRepository,
    private val blocks: MaintenanceRepository,
    private val events: InventoryEventRepository,
    private val jdbc: JdbcTemplate,
) {
    private lateinit var guest: Customer
    private lateinit var first: Apartment
    private lateinit var second: Apartment
    private lateinit var third: Apartment

    private fun key() = UUID.randomUUID().toString()

    @BeforeEach
    fun fixtures() {
        for (table in
            listOf(
                "inventory_events",
                "inventory_operations",
                "reservations",
                "maintenance_blocks",
                "customers",
                "apartments",
            )) jdbc.update("DELETE FROM $table WHERE id IS NOT NULL")
        guest =
            guests.saveAndFlush(Customer.buildCustomer("Concurrent", "Test", "000", "Synthetic"))
        first = rooms.saveAndFlush(Apartment(null, 2, "South", "Lake", 100, 150))
        second = rooms.saveAndFlush(Apartment(null, 2, "East", "Garden", 100, 150))
        third = rooms.saveAndFlush(Apartment(null, 4, "West", "Synthetic", 100, 150))
    }

    private fun create(
        room: Apartment = first,
        start: String = "2026-11-06",
        end: String = "2026-11-09",
        count: Int = 1,
        operation: String = key(),
    ) = service.create(guest.id!!, room.id!!, start, end, count, operation)

    private fun race(vararg actions: () -> OperationResult): List<String> {
        val start = CountDownLatch(1)
        val ready = CountDownLatch(actions.size)
        val executor = Executors.newFixedThreadPool(actions.size)
        try {
            val results = actions.map { action ->
                executor.submit<String> {
                    ready.countDown()
                    check(start.await(10, TimeUnit.SECONDS))
                    try {
                        action()
                        "COMMITTED"
                    } catch (error: DomainException) {
                        error.code
                    }
                }
            }
            check(ready.await(10, TimeUnit.SECONDS))
            start.countDown()
            return results.map { it.get(15, TimeUnit.SECONDS) }
        } finally {
            start.countDown()
            executor.shutdownNow()
            check(executor.awaitTermination(10, TimeUnit.SECONDS))
        }
    }

    private fun oneCommitted(results: List<String>) {
        assertThat(results.count { it == "COMMITTED" }).isEqualTo(1)
        assertThat(results.filter { it != "COMMITTED" }).allMatch {
            it in setOf("INVENTORY_CONFLICT", "STALE_VERSION", "RESERVATION_CHANGED")
        }
    }

    @Test
    fun competingCreatesCannotBothClaimTheSameRoom() {
        repeat(5) { round ->
            val start = "2026-12-${(round * 3 + 1).toString().padStart(2, '0')}"
            val end = "2026-12-${(round * 3 + 3).toString().padStart(2, '0')}"
            oneCommitted(
                race({ create(start = start, end = end) }, { create(start = start, end = end) })
            )
        }
        assertThat(reservations.count()).isEqualTo(5)
        assertThat(events.count()).isEqualTo(5)
        assertThat(
                jdbc.queryForObject("SELECT COUNT(*) FROM inventory_operations", Long::class.java)
            )
            .isEqualTo(5)
    }

    @Test
    fun createAndMoveShareTheDestinationLock() {
        val old = create()
        oneCommitted(
            race({ create(second) }, { service.move(old.resourceId, second.id!!, 0, key()) })
        )
        assertThat(
                reservations.findAll().count {
                    it.roomId == second.id && it.status == ReservationStatus.ACTIVE
                }
            )
            .isEqualTo(1)
    }

    @Test
    fun competingMovesShareTheDestinationLock() {
        val one = create(first)
        val two = create(second)
        oneCommitted(
            race(
                { service.move(one.resourceId, third.id!!, 0, key()) },
                { service.move(two.resourceId, third.id!!, 0, key()) },
            )
        )
        assertThat(reservations.findAll().count { it.roomId == third.id }).isEqualTo(1)
    }

    @Test
    fun twoMovesOfTheSameVersionCannotOverwriteEachOther() {
        val booking = create()
        oneCommitted(
            race(
                { service.move(booking.resourceId, second.id!!, 0, key()) },
                { service.move(booking.resourceId, third.id!!, 0, key()) },
            )
        )
        assertThat(service.reservation(booking.resourceId).version).isEqualTo(1)
        assertThat(events.count()).isEqualTo(2)
    }

    @Test
    fun cancellationAndCreationSerializeOnTheReleasedRoom() {
        val booking = create()
        val results = race({ service.cancel(booking.resourceId, 0, key()) }, { create() })
        assertThat(results.first()).isEqualTo("COMMITTED")
        assertThat(results.last()).isIn("COMMITTED", "INVENTORY_CONFLICT")
        assertThat(reservations.findAll().count { it.status == ReservationStatus.ACTIVE })
            .isLessThanOrEqualTo(1)
        assertThat(service.reservation(booking.resourceId).status)
            .isEqualTo(ReservationStatus.CANCELLED)
        if (results.last() == "INVENTORY_CONFLICT") create()
        assertThat(reservations.findAll().count { it.status == ReservationStatus.ACTIVE })
            .isEqualTo(1)
    }

    @Test
    fun everyOverlapShapeIsRejectedWhileAdjacentStaysAreAllowed() {
        create()
        for ((start, end) in
            listOf(
                "2026-11-06" to "2026-11-09",
                "2026-11-07" to "2026-11-08",
                "2026-11-05" to "2026-11-10",
                "2026-11-05" to "2026-11-07",
                "2026-11-08" to "2026-11-10",
            )) {
            assertThat(service.findAvailableApartments(start, end).map { it.id })
                .doesNotContain(first.id)
            assertThat(assertThrows<DomainException> { create(start = start, end = end) }.code)
                .isEqualTo("INVENTORY_CONFLICT")
        }
        for ((start, end) in listOf("2026-11-04" to "2026-11-06", "2026-11-09" to "2026-11-11")) {
            assertThat(service.findAvailableApartments(start, end).map { it.id }).contains(first.id)
            create(start = start, end = end)
        }
        assertThat(reservations.count()).isEqualTo(3)
    }

    @Test
    fun extensionAndAdjacentCreationCannotBothConsumeNewNights() {
        val old = create(end = "2026-11-08")
        oneCommitted(
            race(
                { service.change(old.resourceId, "2026-11-06", "2026-11-10", 1, 0, key()) },
                { create(start = "2026-11-08", end = "2026-11-10") },
            )
        )
    }

    @Test
    fun bookingAndMaintenanceUseTheSameInventoryProtocol() {
        oneCommitted(
            race(
                { create() },
                {
                    service.block(
                        first.id!!,
                        "2026-11-06",
                        "2026-11-09",
                        "Synthetic maintenance",
                        key(),
                    )
                },
            )
        )
        assertThat(reservations.count() + blocks.count()).isEqualTo(1)
        assertThat(service.findAvailableApartments("2026-11-06", "2026-11-09").map { it.id })
            .doesNotContain(first.id)
    }

    @Test
    fun duplicateKeysReturnOneSavedOutcomeEvenWhenRequestsRace() {
        val operation = key()
        assertThat(race({ create(operation = operation) }, { create(operation = operation) }))
            .containsOnly("COMMITTED")
        val saved = service.operation(OperationKind.CREATE, operation)
        assertThat(create(operation = operation)).isEqualTo(saved)
        assertThat(reservations.count()).isEqualTo(1)
        assertThat(events.count()).isEqualTo(1)
        val reused = assertThrows<DomainException> { create(second, operation = operation) }
        assertThat(reused.code).isEqualTo("IDEMPOTENCY_KEY_REUSED")
        assertThat(reservations.count()).isEqualTo(1)
    }

    @Test
    fun staleEditsRollBackTheOperationAndAuditTogether() {
        val saved = create()
        service.move(saved.resourceId, second.id!!, 0, key())
        val stale =
            assertThrows<DomainException> { service.move(saved.resourceId, third.id!!, 0, key()) }
        assertThat(stale.code).isEqualTo("STALE_VERSION")
        assertThat(service.reservation(saved.resourceId).roomId).isEqualTo(second.id)
        assertThat(events.count()).isEqualTo(2)
        assertThat(
                jdbc.queryForObject("SELECT COUNT(*) FROM inventory_operations", Long::class.java)
            )
            .isEqualTo(2)
    }

    @Test
    fun anAuditFailureAfterTheBookingInsertRollsBackTheWholeWrite() {
        val operation = key()
        jdbc.execute(
            "CREATE TRIGGER synthetic_audit_failure BEFORE INSERT ON inventory_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Synthetic audit failure'"
        )
        try {
            assertThrows<RuntimeException> { create(operation = operation) }
            assertThat(reservations.count()).isZero()
            assertThat(events.count()).isZero()
            assertThat(
                    jdbc.queryForObject(
                        "SELECT COUNT(*) FROM inventory_operations",
                        Long::class.java,
                    )
                )
                .isZero()
            assertThat(
                    assertThrows<DomainException> {
                            service.operation(OperationKind.CREATE, operation)
                        }
                        .code
                )
                .isEqualTo("OPERATION_NOT_COMMITTED")
        } finally {
            jdbc.execute("DROP TRIGGER IF EXISTS synthetic_audit_failure")
        }
        create(operation = operation)
        assertThat(reservations.count()).isEqualTo(1)
    }

    @Test
    fun sameRoomIsANoopAndCancellationRetainsHistoryButReleasesInventory() {
        val saved = create()
        val unchanged = service.move(saved.resourceId, first.id!!, 0, key())
        assertThat(unchanged.reservation!!.version).isZero()
        assertThat(events.count()).isEqualTo(1)
        first.active = false
        first = rooms.saveAndFlush(first)
        assertThat(service.move(saved.resourceId, first.id!!, 0, key()).reservation!!.version)
            .isZero()
        first.active = true
        first = rooms.saveAndFlush(first)
        val cancelled = service.cancel(saved.resourceId, 0, key())
        assertThat(cancelled.reservation!!.status).isEqualTo(ReservationStatus.CANCELLED)
        assertThat(reservations.findById(saved.resourceId)).isPresent
        assertThat(service.findReservationsByCustomer(guest.id!!)).isEmpty()
        assertThat(service.findAvailableApartments("2026-11-06", "2026-11-09").map { it.id })
            .contains(first.id)
        create()
        assertThat(events.count()).isEqualTo(3)
    }

    @Test
    fun capacityReferencesAndActiveStateAreValidatedBeforeWriting() {
        assertThat(assertThrows<DomainException> { create(count = 0) }.code)
            .isEqualTo("INVALID_GUEST_COUNT")
        assertThat(assertThrows<DomainException> { create(count = 3) }.code)
            .isEqualTo("CAPACITY_EXCEEDED")
        assertThat(
                assertThrows<DomainException> {
                        service.create(999999, first.id!!, "2026-11-06", "2026-11-09", 1, key())
                    }
                    .code
            )
            .isEqualTo("NOT_FOUND")
        assertThat(assertThrows<DomainException> { create(first.copy(id = 999999)) }.code)
            .isEqualTo("NOT_FOUND")
        first.active = false
        rooms.saveAndFlush(first)
        assertThat(assertThrows<DomainException> { create() }.code).isEqualTo("ROOM_INACTIVE")
        assertThat(reservations.count()).isZero()
        assertThat(events.count()).isZero()
        assertThat(
                jdbc.queryForObject("SELECT COUNT(*) FROM inventory_operations", Long::class.java)
            )
            .isZero()
    }

    @Test
    fun maintenanceCanBeCancelledWithItsVersionAndIdempotentlyReconciled() {
        val saved = service.block(first.id!!, "2026-11-06", "2026-11-09", "Synthetic", key())
        assertThat(assertThrows<DomainException> { create() }.code).isEqualTo("INVENTORY_CONFLICT")
        val operation = key()
        val cancelled = service.unblock(saved.resourceId, 0, operation)
        assertThat(service.operation(OperationKind.UNBLOCK, operation)).isEqualTo(cancelled)
        create()
        assertThat(blocks.findById(saved.resourceId).get().status)
            .isEqualTo(ReservationStatus.CANCELLED)
    }

    @Test
    fun changesEnforceCapacityAndVersionsAndCancelledRecordsCannotMove() {
        val saved = create()
        assertThat(
                assertThrows<DomainException> {
                        service.change(saved.resourceId, "2026-11-06", "2026-11-09", 3, 0, key())
                    }
                    .code
            )
            .isEqualTo("CAPACITY_EXCEEDED")
        assertThat(
                assertThrows<DomainException> {
                        service.move(saved.resourceId, second.id!!, -1, key())
                    }
                    .code
            )
            .isEqualTo("INVALID_VERSION")
        val unchanged = service.change(saved.resourceId, "2026-11-06", "2026-11-09", 1, 0, key())
        assertThat(unchanged.reservation!!.version).isZero()
        val changed = service.change(saved.resourceId, "2026-11-05", "2026-11-10", 2, 0, key())
        assertThat(changed.reservation!!.version).isEqualTo(1)
        assertThat(changed.reservation.guestCount).isEqualTo(2)
        assertThat(
                assertThrows<DomainException> { service.cancel(saved.resourceId, 0, key()) }.code
            )
            .isEqualTo("STALE_VERSION")
        service.cancel(saved.resourceId, 1, key())
        val repeated = service.cancel(saved.resourceId, 2, key())
        assertThat(repeated.reservation!!.version).isEqualTo(2)
        assertThat(
                assertThrows<DomainException> {
                        service.move(saved.resourceId, second.id!!, 2, key())
                    }
                    .code
            )
            .isEqualTo("RESERVATION_CANCELLED")
        assertThat(
                assertThrows<DomainException> {
                        service.change(saved.resourceId, "2026-11-06", "2026-11-09", 1, 2, key())
                    }
                    .code
            )
            .isEqualTo("RESERVATION_CANCELLED")
        assertThat(events.count()).isEqualTo(3)
    }

    @Test
    fun maintenanceAndMissingRecordsHaveDefinitiveValidationErrors() {
        for (reason in listOf(" ", "x".repeat(201))) {
            assertThat(
                    assertThrows<DomainException> {
                            service.block(first.id!!, "2026-11-06", "2026-11-09", reason, key())
                        }
                        .code
                )
                .isEqualTo("INVALID_REASON")
        }
        assertThat(
                assertThrows<DomainException> {
                        service.block(0, "2026-11-06", "2026-11-09", "Synthetic", key())
                    }
                    .code
            )
            .isEqualTo("INVALID_ID")
        assertThat(
                assertThrows<DomainException> { service.move(999999, first.id!!, 0, key()) }.code
            )
            .isEqualTo("NOT_FOUND")
        assertThat(
                assertThrows<DomainException> {
                        service.change(999999, "2026-11-06", "2026-11-09", 1, 0, key())
                    }
                    .code
            )
            .isEqualTo("NOT_FOUND")
        assertThat(assertThrows<DomainException> { service.cancel(999999, 0, key()) }.code)
            .isEqualTo("NOT_FOUND")
        assertThat(assertThrows<DomainException> { service.unblock(999999, 0, key()) }.code)
            .isEqualTo("NOT_FOUND")
        assertThat(
                assertThrows<DomainException> { service.operation(OperationKind.CREATE, "invalid") }
                    .code
            )
            .isEqualTo("INVALID_OPERATION_KEY")
        assertThat(
                assertThrows<DomainException> { service.operation(OperationKind.CREATE, key()) }
                    .code
            )
            .isEqualTo("OPERATION_NOT_COMMITTED")
        val block = service.block(first.id!!, "2026-11-06", "2026-11-09", " Synthetic ", key())
        assertThat(block.maintenance!!.reason).isEqualTo("Synthetic")
        assertThat(
                assertThrows<DomainException> { service.unblock(block.resourceId, 2, key()) }.code
            )
            .isEqualTo("STALE_VERSION")
        service.unblock(block.resourceId, 0, key())
        assertThat(service.unblock(block.resourceId, 1, key()).maintenance!!.version).isEqualTo(1)
        assertThat(events.count()).isEqualTo(2)
    }

    @Test
    fun referencesAndReadsCannotEscapeTheConfiguredProperty() {
        val otherGuest = guests.saveAndFlush(guest.copy(id = null, propertyId = "other"))
        val otherRoom = rooms.saveAndFlush(first.copy(id = null, propertyId = "other"))
        val otherBooking =
            reservations.saveAndFlush(
                Reservation(
                    null,
                    otherGuest.id,
                    otherRoom.id,
                    java.time.LocalDate.parse("2026-11-06"),
                    java.time.LocalDate.parse("2026-11-09"),
                    propertyId = "other",
                )
            )
        assertThat(service.findReservationsByCustomer(otherGuest.id!!)).isEmpty()
        assertThat(service.findAvailableApartments("2026-11-06", "2026-11-09").map { it.id })
            .doesNotContain(otherRoom.id)
        assertThat(assertThrows<DomainException> { service.reservation(otherBooking.id!!) }.code)
            .isEqualTo("NOT_FOUND")
        assertThat(
                assertThrows<DomainException> {
                        service.move(otherBooking.id!!, first.id!!, 0, key())
                    }
                    .code
            )
            .isEqualTo("NOT_FOUND")
        assertThat(
                assertThrows<DomainException> {
                        service.create(
                            otherGuest.id!!,
                            first.id!!,
                            "2026-11-06",
                            "2026-11-09",
                            1,
                            key(),
                        )
                    }
                    .code
            )
            .isEqualTo("NOT_FOUND")
        assertThat(assertThrows<DomainException> { create(otherRoom) }.code).isEqualTo("NOT_FOUND")
        assertThat(events.count()).isZero()
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
        fun properties(properties: DynamicPropertyRegistry) {
            properties.add("spring.datasource.url", database::getJdbcUrl)
            properties.add("spring.datasource.username", database::getUsername)
            properties.add("spring.datasource.password", database::getPassword)
            properties.add("spring.datasource.driver-class-name", database::getDriverClassName)
            properties.add("spring.jpa.hibernate.ddl-auto") { "validate" }
        }
    }
}
