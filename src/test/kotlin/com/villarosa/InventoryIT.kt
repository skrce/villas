package com.villarosa

import com.villarosa.exception.DomainException
import com.villarosa.repository.*
import com.villarosa.repository.model.*
import com.villarosa.service.BookingQuote
import com.villarosa.service.QuoteService
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
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.EnumSource
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@ActiveProfiles("test")
@Testcontainers
class InventoryIT
@Autowired
constructor(
    private val service: ReservationService,
    private val quotes: QuoteService,
    private val rooms: ApartmentRepository,
    private val guests: CustomerRepository,
    private val reservations: ReservationRepository,
    private val blocks: MaintenanceRepository,
    private val events: InventoryEventRepository,
    private val jdbc: JdbcTemplate,
    private val transactionManager: PlatformTransactionManager,
) {
    private val reviewed = ReviewedChanges(service, quotes, transactionManager)
    private lateinit var guest: Customer
    private lateinit var first: Apartment
    private lateinit var second: Apartment
    private lateinit var third: Apartment

    private fun key() = UUID.randomUUID().toString()

    @BeforeEach
    fun fixtures() {
        TestData.reset(jdbc, database.jdbcUrl)
        TestData.seedOwner(jdbc, index = 1)
        guest =
            guests.saveAndFlush(Customer.buildCustomer("Concurrent", "Test", "000", "Synthetic"))
        first =
            rooms.saveAndFlush(
                Apartment(null, 2, "South", "Lake", 100, 150, baseRateCents = 5001, rateVersion = 1)
            )
        second =
            rooms.saveAndFlush(
                Apartment(
                    null,
                    2,
                    "East",
                    "Garden",
                    100,
                    150,
                    baseRateCents = 5001,
                    rateVersion = 1,
                )
            )
        third =
            rooms.saveAndFlush(
                Apartment(
                    null,
                    4,
                    "West",
                    "Synthetic",
                    100,
                    150,
                    baseRateCents = 5001,
                    rateVersion = 1,
                )
            )
    }

    private fun create(
        room: Apartment = first,
        start: String = "2026-11-06",
        end: String = "2026-11-09",
        count: Int = 1,
        operation: String = key(),
        quote: BookingQuote? = null,
    ) =
        service.create(
            guest.id!!,
            room.id!!,
            start,
            end,
            count,
            operation,
            quoteId = (quote ?: quotes.create(room.id!!, start, end, count)).id,
        )

    private fun race(
        vararg actions: () -> OperationResult,
        sameOwner: Boolean = false,
    ): List<String> {
        val start = CountDownLatch(1)
        val ready = CountDownLatch(actions.size)
        val executor = Executors.newFixedThreadPool(actions.size)
        try {
            val results = actions.mapIndexed { index, action ->
                executor.submit<String> {
                    val context =
                        org.springframework.security.core.context.SecurityContextHolder
                            .createEmptyContext()
                    context.authentication =
                        com.villarosa.security.StaffAuthentication(
                            TestData.ownerIdentity(if (sameOwner) 0 else index)
                        )
                    org.springframework.security.core.context.SecurityContextHolder.setContext(
                        context
                    )
                    ready.countDown()
                    check(start.await(10, TimeUnit.SECONDS))
                    try {
                        action()
                        "COMMITTED"
                    } catch (error: DomainException) {
                        error.code
                    } finally {
                        org.springframework.security.core.context.SecurityContextHolder
                            .clearContext()
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
            race({ create(second) }, { reviewed.move(old.resourceId, second.id!!, 0, key()) })
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
                { reviewed.move(one.resourceId, third.id!!, 0, key()) },
                { reviewed.move(two.resourceId, third.id!!, 0, key()) },
            )
        )
        assertThat(reservations.findAll().count { it.roomId == third.id }).isEqualTo(1)
    }

    @Test
    fun twoMovesOfTheSameVersionCannotOverwriteEachOther() {
        val booking = create()
        oneCommitted(
            race(
                { reviewed.move(booking.resourceId, second.id!!, 0, key()) },
                { reviewed.move(booking.resourceId, third.id!!, 0, key()) },
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
                { reviewed.change(old.resourceId, "2026-11-06", "2026-11-10", 1, 0, key()) },
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
        val quote = quotes.create(first.id!!, "2026-11-06", "2026-11-09", 1)
        assertThat(
                race(
                    { create(operation = operation, quote = quote) },
                    { create(operation = operation, quote = quote) },
                    sameOwner = true,
                )
            )
            .containsOnly("COMMITTED")
        val saved = service.operation(OperationKind.CREATE, operation)
        assertThat(create(operation = operation, quote = quote)).isEqualTo(saved)
        assertThat(reservations.count()).isEqualTo(1)
        assertThat(events.count()).isEqualTo(1)
        val reused =
            assertThrows<DomainException> { create(second, operation = operation, quote = quote) }
        assertThat(reused.code).isEqualTo("IDEMPOTENCY_KEY_REUSED")
        assertThat(reservations.count()).isEqualTo(1)
    }

    @Test
    fun staleEditsRollBackTheOperationAndAuditTogether() {
        val saved = create()
        reviewed.move(saved.resourceId, second.id!!, 0, key())
        val stale =
            assertThrows<DomainException> { reviewed.move(saved.resourceId, third.id!!, 0, key()) }
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
        val quote = quotes.create(first.id!!, "2026-11-06", "2026-11-09", 1)
        jdbc.execute(
            "CREATE OR REPLACE FUNCTION synthetic_audit_failure_fn() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RAISE EXCEPTION 'Synthetic audit failure' USING ERRCODE='45000'; END \$\$; CREATE TRIGGER synthetic_audit_failure BEFORE INSERT ON inventory_events FOR EACH ROW EXECUTE FUNCTION synthetic_audit_failure_fn()"
        )
        try {
            assertThrows<RuntimeException> { create(operation = operation, quote = quote) }
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
            jdbc.execute("DROP TRIGGER IF EXISTS synthetic_audit_failure ON inventory_events")
        }
        create(operation = operation, quote = quote)
        assertThat(reservations.count()).isEqualTo(1)
    }

    @ParameterizedTest
    @EnumSource(
        value = OperationKind::class,
        names = ["MOVE", "CHANGE", "CANCEL", "BLOCK", "UNBLOCK"],
    )
    fun auditFailureRollsBackEveryInventoryMutation(kind: OperationKind) {
        val booking =
            if (kind in setOf(OperationKind.MOVE, OperationKind.CHANGE, OperationKind.CANCEL))
                create()
            else null
        val block =
            if (kind == OperationKind.UNBLOCK)
                service.block(first.id!!, "2026-11-06", "2026-11-09", "Synthetic", key())
            else null
        val beforeBookings = reservations.findAll().map { it.copy() }
        val beforeBlocks = blocks.findAll().map { it.copy() }
        val beforeEvents = events.count()
        val beforeOperations =
            jdbc.queryForObject("SELECT COUNT(*) FROM inventory_operations", Long::class.java)
        val operation = key()
        val action = {
            when (kind) {
                OperationKind.MOVE -> reviewed.move(booking!!.resourceId, second.id!!, 0, operation)
                OperationKind.CHANGE ->
                    reviewed.change(
                        booking!!.resourceId,
                        "2026-11-05",
                        "2026-11-10",
                        2,
                        0,
                        operation,
                    )
                OperationKind.CANCEL -> service.cancel(booking!!.resourceId, 0, operation)
                OperationKind.BLOCK ->
                    service.block(first.id!!, "2026-11-06", "2026-11-09", "Synthetic", operation)
                OperationKind.UNBLOCK -> service.unblock(block!!.resourceId, 0, operation)
                else -> error("Creation has a separate rollback regression.")
            }
        }
        jdbc.execute(
            "CREATE OR REPLACE FUNCTION synthetic_audit_failure_fn() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RAISE EXCEPTION 'Synthetic audit failure' USING ERRCODE='45000'; END \$\$; CREATE TRIGGER synthetic_audit_failure BEFORE INSERT ON inventory_events FOR EACH ROW EXECUTE FUNCTION synthetic_audit_failure_fn()"
        )
        try {
            assertThrows<RuntimeException> { action() }
            assertThat(reservations.findAll()).containsExactlyInAnyOrderElementsOf(beforeBookings)
            assertThat(blocks.findAll()).containsExactlyInAnyOrderElementsOf(beforeBlocks)
            assertThat(events.count()).isEqualTo(beforeEvents)
            assertThat(
                    jdbc.queryForObject(
                        "SELECT COUNT(*) FROM inventory_operations",
                        Long::class.java,
                    )
                )
                .isEqualTo(beforeOperations)
            assertThat(assertThrows<DomainException> { service.operation(kind, operation) }.code)
                .isEqualTo("OPERATION_NOT_COMMITTED")
        } finally {
            jdbc.execute("DROP TRIGGER IF EXISTS synthetic_audit_failure ON inventory_events")
        }
        action()
        assertThat(events.count()).isEqualTo(beforeEvents + 1)
    }

    @Test
    fun historicalResultsReplayAfterLaterMovesChangesAndCancellations() {
        val creationKey = key()
        val quote = quotes.create(first.id!!, "2026-11-06", "2026-11-09", 1)
        val original = create(operation = creationKey, quote = quote)
        val moveKey = key()
        val moved = reviewed.move(original.resourceId, second.id!!, 0, moveKey)
        val changeKey = key()
        val changed =
            reviewed.change(original.resourceId, "2026-11-05", "2026-11-10", 2, 1, changeKey)
        val cancelKey = key()
        val cancelled = service.cancel(original.resourceId, 2, cancelKey)
        assertThat(create(operation = creationKey, quote = quote)).isEqualTo(original)
        assertThat(reviewed.move(original.resourceId, second.id!!, 0, moveKey)).isEqualTo(moved)
        assertThat(
                reviewed.change(original.resourceId, "2026-11-05", "2026-11-10", 2, 1, changeKey)
            )
            .isEqualTo(changed)
        assertThat(service.cancel(original.resourceId, 2, cancelKey)).isEqualTo(cancelled)
        assertThat(service.reservation(original.resourceId).version).isEqualTo(3)
        val blockKey = key()
        val blocked = service.block(third.id!!, "2026-11-06", "2026-11-09", "Synthetic", blockKey)
        val unblockKey = key()
        val unblocked = service.unblock(blocked.resourceId, 0, unblockKey)
        assertThat(service.block(third.id!!, "2026-11-06", "2026-11-09", "Synthetic", blockKey))
            .isEqualTo(blocked)
        assertThat(service.unblock(blocked.resourceId, 0, unblockKey)).isEqualTo(unblocked)
        assertThat(events.count()).isEqualTo(6)
    }

    @Test
    fun oppositeMovesOfNonoverlappingStaysCompleteWithoutALockCycle() {
        val one = create(first, end = "2026-11-08")
        val two = create(second, start = "2026-11-08", end = "2026-11-10")
        assertThat(
                race(
                    { reviewed.move(one.resourceId, second.id!!, 0, key()) },
                    { reviewed.move(two.resourceId, first.id!!, 0, key()) },
                )
            )
            .containsOnly("COMMITTED")
        assertThat(service.reservation(one.resourceId).roomId).isEqualTo(second.id)
        assertThat(service.reservation(two.resourceId).roomId).isEqualTo(first.id)
    }

    @Test
    fun committedInventoryWritesDoNotReuseOrRollBackWithAnOuterPersistenceContext() {
        val original = create()
        TransactionTemplate(transactionManager).execute { outer ->
            val cached = reservations.findById(original.resourceId).get()
            assertThat(cached.roomId).isEqualTo(first.id)
            reviewed.move(original.resourceId, second.id!!, 0, key())
            reviewed.change(original.resourceId, "2026-11-05", "2026-11-10", 2, 1, key())
            outer.setRollbackOnly()
        }
        val current = service.reservation(original.resourceId)
        assertThat(current.roomId).isEqualTo(second.id)
        assertThat(current.startDate).isEqualTo("2026-11-05")
        assertThat(current.version).isEqualTo(2)
    }

    @Test
    fun sameRoomIsANoopAndCancellationRetainsHistoryButReleasesInventory() {
        val saved = create()
        val unchanged = reviewed.move(saved.resourceId, first.id!!, 0, key())
        assertThat(unchanged.reservation!!.version).isZero()
        assertThat(events.count()).isEqualTo(1)
        first.active = false
        first = rooms.saveAndFlush(first)
        assertThat(reviewed.move(saved.resourceId, first.id!!, 0, key()).reservation!!.version)
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
                        reviewed.change(saved.resourceId, "2026-11-06", "2026-11-09", 3, 0, key())
                    }
                    .code
            )
            .isEqualTo("CAPACITY_EXCEEDED")
        assertThat(
                assertThrows<DomainException> {
                        reviewed.move(saved.resourceId, second.id!!, -1, key())
                    }
                    .code
            )
            .isEqualTo("INVALID_VERSION")
        val unchanged = reviewed.change(saved.resourceId, "2026-11-06", "2026-11-09", 1, 0, key())
        assertThat(unchanged.reservation!!.version).isZero()
        val changed = reviewed.change(saved.resourceId, "2026-11-05", "2026-11-10", 2, 0, key())
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
                        reviewed.move(saved.resourceId, second.id!!, 2, key())
                    }
                    .code
            )
            .isEqualTo("RESERVATION_CANCELLED")
        assertThat(
                assertThrows<DomainException> {
                        reviewed.change(saved.resourceId, "2026-11-06", "2026-11-09", 1, 2, key())
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
                assertThrows<DomainException> { reviewed.move(999999, first.id!!, 0, key()) }.code
            )
            .isEqualTo("NOT_FOUND")
        assertThat(
                assertThrows<DomainException> {
                        reviewed.change(999999, "2026-11-06", "2026-11-09", 1, 0, key())
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
        TestData.registerBusiness(jdbc, "other")
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
                        reviewed.move(otherBooking.id!!, first.id!!, 0, key())
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

    @Test
    fun operationRecoveryIsScopedToTheCanonicalOwner() {
        val operation = key()
        val committed = create(operation = operation)
        org.springframework.security.core.context.SecurityContextHolder.getContext()
            .authentication = com.villarosa.security.StaffAuthentication(TestData.ownerIdentity(1))
        assertThat(
                assertThrows<DomainException> { service.operation(OperationKind.CREATE, operation) }
                    .code
            )
            .isEqualTo("OPERATION_NOT_COMMITTED")
        val other = create(second, operation = operation)
        assertThat(other.resourceId).isNotEqualTo(committed.resourceId)
        assertThat(events.findAll().map { it.actorId })
            .containsExactlyInAnyOrder(TestData.ownerIdentity().id, TestData.ownerIdentity(1).id)
    }

    @Test
    fun aWriteWaitingForTheOwnerLockRechecksDeactivationBeforeChangingInventory() {
        val executor = Executors.newSingleThreadExecutor()
        val ready = CountDownLatch(1)
        lateinit var future: java.util.concurrent.Future<String>
        try {
            TransactionTemplate(transactionManager).executeWithoutResult {
                jdbc.queryForObject(
                    "SELECT id FROM staff_accounts WHERE id = ? FOR UPDATE",
                    String::class.java,
                    TestData.ownerIdentity().id,
                )
                future =
                    executor.submit<String> {
                        org.springframework.security.core.context.SecurityContextHolder.getContext()
                            .authentication =
                            com.villarosa.security.StaffAuthentication(TestData.ownerIdentity())
                        ready.countDown()
                        try {
                            create()
                            "COMMITTED"
                        } catch (error: DomainException) {
                            error.code
                        } finally {
                            org.springframework.security.core.context.SecurityContextHolder
                                .clearContext()
                        }
                    }
                check(ready.await(10, TimeUnit.SECONDS))
                jdbc.update(
                    "UPDATE staff_accounts SET active = FALSE, security_version = security_version + 1 WHERE id = ?",
                    TestData.ownerIdentity().id,
                )
            }
            assertThat(future.get(15, TimeUnit.SECONDS)).isEqualTo("SESSION_REVOKED")
            assertThat(reservations.count()).isZero()
            assertThat(events.count()).isZero()
            assertThat(
                    jdbc.queryForObject(
                        "SELECT COUNT(*) FROM inventory_operations",
                        Long::class.java,
                    )
                )
                .isZero()
        } finally {
            executor.shutdownNow()
            check(executor.awaitTermination(10, TimeUnit.SECONDS))
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
        fun properties(properties: DynamicPropertyRegistry) {
            properties.add("spring.session.jdbc.initialize-schema") { "never" }
            properties.add("spring.datasource.url", database::getJdbcUrl)
            properties.add("spring.datasource.username", database::getUsername)
            properties.add("spring.datasource.password", database::getPassword)
            properties.add("spring.datasource.driver-class-name", database::getDriverClassName)
            properties.add("spring.jpa.hibernate.ddl-auto") { "validate" }
        }
    }
}
