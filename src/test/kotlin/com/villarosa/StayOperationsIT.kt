package com.villarosa

import com.villarosa.exception.DomainException
import com.villarosa.repository.*
import com.villarosa.repository.model.*
import com.villarosa.security.StaffAuthentication
import com.villarosa.service.*
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import java.util.concurrent.CyclicBarrier
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
@Import(PriceClockConfiguration::class)
@Testcontainers
class StayOperationsIT
@Autowired
constructor(
    private val stays: StayOperations,
    private val readiness: ReadinessService,
    private val inventory: ReservationService,
    private val ledger: LedgerService,
    private val quotes: QuoteService,
    private val operations: OperationCoordinator,
    private val rooms: ApartmentRepository,
    private val guests: CustomerRepository,
    private val reservations: ReservationRepository,
    private val clock: MutablePriceClock,
    private val jdbc: JdbcTemplate,
) {
    private lateinit var room: Apartment
    private var guest = 0
    private var id = 0

    private fun key() = UUID.randomUUID().toString()

    private fun version(booking: Int = id) = inventory.reservation(booking).version

    @BeforeEach
    fun fixtures() {
        TestData.reset(jdbc, database.jdbcUrl)
        TestData.seedOwner(jdbc, index = 1)
        clock.value = Instant.parse("2026-11-06T12:00:00.123456Z")
        room =
            rooms.saveAndFlush(
                Apartment(
                    capacity = 4,
                    name = "Synthetic lifecycle",
                    reference = "STAY-1",
                    baseRateCents = 5001,
                    rateVersion = 1,
                )
            )
        guest = guests.saveAndFlush(Customer(firstName = "Synthetic", lastName = "Lifecycle")).id!!
        id = book(room.id!!, "2026-11-07", "2026-11-09")
        clock.value = Instant.parse("2026-11-07T12:00:00.123456Z")
    }

    private fun book(roomId: Int, start: String, end: String): Int {
        val quote = quotes.create(roomId, start, end, 2)
        return inventory.createQuoted(guest, quote.id, roomId, start, end, 2, key()).resourceId
    }

    private fun clean(roomId: Int = room.id!!): Long {
        val current = readiness.read(roomId)
        var version = current.version
        if (current.state == ReadinessState.CLEAN) return version
        if (current.state == ReadinessState.DIRTY)
            readiness.change(roomId, ReadinessState.IN_PROGRESS, version++, key(), null)
        if (readiness.read(roomId).state == ReadinessState.IN_PROGRESS)
            readiness.change(roomId, ReadinessState.INSPECTION, version++, key(), null)
        readiness.change(roomId, ReadinessState.CLEAN, version, key(), null)
        return readiness.read(roomId).version
    }

    private fun arrive(booking: Int = id, roomId: Int = room.id!!) =
        stays.checkIn(booking, version(booking), clean(roomId), key())

    private fun failure(action: () -> Unit) = assertThrows<DomainException> { action() }.code

    @Test
    fun checkInRequiresInspectedCleanReadinessAndKeepsAnImmutableActualArrival() {
        assertThat(failure { stays.checkIn(id, 0, 0, key()) }).isEqualTo("ROOM_NOT_READY")
        val ready = clean()
        val stable = key()
        val saved = stays.checkIn(id, 0, ready, stable)
        assertThat(saved.reservation!!.phase).isEqualTo(StayPhase.CHECKED_IN)
        assertThat(saved.reservation.checkedInAt).isEqualTo(clock.value.toString())
        assertThat(saved.inventoryEvent!!.kind).isEqualTo("CHECKED_IN")
        assertThat(saved.inventoryEvent.actorId).isEqualTo(TestData.ownerIdentity().id)
        assertThat(saved.readiness!!.state).isEqualTo(ReadinessState.CLEAN)
        assertThat(stays.checkIn(id, 0, ready, stable)).isEqualTo(saved)
        assertThat(failure { stays.checkIn(id, 1, ready, key()) })
            .isEqualTo("INVALID_STAY_TRANSITION")
    }

    @ParameterizedTest
    @ValueSource(strings = ["2026-11-06T22:59:59.999999Z", "2026-11-08T23:00:00Z"])
    fun checkInRejectsTimesOutsideTheBookedPropertyDates(now: String) {
        val ready = clean()
        clock.value = Instant.parse(now)
        assertThat(failure { stays.checkIn(id, 0, ready, key()) }).isEqualTo("CHECK_IN_DATE")
        assertThat(version()).isZero()
    }

    @ParameterizedTest
    @ValueSource(strings = ["2026-11-06T23:00:00Z", "2026-11-08T22:59:59.999999Z"])
    fun checkInAcceptsBothEdgesInsideThePropertyStay(now: String) {
        val ready = clean()
        clock.value = Instant.parse(now)
        assertThat(stays.checkIn(id, 0, ready, key()).reservation!!.checkedInAt).isEqualTo(now)
    }

    @Test
    fun aNewCleaningCycleRequiresFreshReadinessReviewEvenWhenTheRoomIsCleanAgain() {
        val first = clean()
        readiness.change(room.id!!, ReadinessState.DIRTY, first, key(), "Synthetic reinspection")
        val latest = clean()
        assertThat(failure { stays.checkIn(id, 0, first, key()) }).isEqualTo("STALE_VERSION")
        stays.checkIn(id, 0, latest, key())
    }

    @Test
    fun anOverduePhysicalGuestBlocksArrivalDespiteNonOverlappingPlannedDates() {
        clean()
        reservations.saveAndFlush(
            Reservation(
                customerId = guest,
                roomId = room.id,
                startDate = LocalDate.parse("2026-11-01"),
                endDate = LocalDate.parse("2026-11-06"),
                phase = StayPhase.CHECKED_IN,
                checkedInAt = Instant.parse("2026-11-01T12:00:00Z"),
            )
        )
        assertThat(failure { stays.checkIn(id, 0, 3, key()) }).isEqualTo("ROOM_OCCUPIED")
        assertThat(inventory.reservation(id).phase).isEqualTo(StayPhase.CONFIRMED)
    }

    @Test
    fun depositRepricingMoveArrivalSettlementDepartureAndCorrectionPreserveEveryAgreement() {
        val receipt = ledger.payment(id, 2501, "CASH", "2026-11-07", 0, key()).ledgerEntry!!
        val extension = quotes.create(room.id!!, "2026-11-07", "2026-11-10", 2)
        stays.change(
            id,
            extension.startDate,
            extension.endDate,
            2,
            version(),
            extension.id,
            "Synthetic extension",
            key(),
        )
        val destination =
            rooms.saveAndFlush(
                Apartment(
                    capacity = 4,
                    name = "Synthetic destination",
                    reference = "STAY-2",
                    baseRateCents = 6001,
                    rateVersion = 1,
                )
            )
        val moveQuote = quotes.create(destination.id!!, extension.startDate, extension.endDate, 2)
        stays.move(
            id,
            destination.id!!,
            version(),
            moveQuote.id,
            null,
            "Synthetic room choice",
            key(),
        )
        arrive(id, destination.id!!)
        ledger.payment(id, 15502, "CARD", "2026-11-07", version(), key())
        clock.value = Instant.parse("2026-11-10T12:00:00.654321Z")
        val expected = version()
        val stable = key()
        val departed = stays.checkOut(id, expected, false, null, stable)
        assertThat(departed.reservation!!.phase).isEqualTo(StayPhase.CHECKED_OUT)
        assertThat(departed.readiness!!.state).isEqualTo(ReadinessState.DIRTY)
        val roomEvent = readiness.history(destination.id!!, "0", 100).items.last()
        assertThat(roomEvent.reservationId).isEqualTo(id)
        assertThat(roomEvent.operationKey).isEqualTo(stable)
        assertThat(ledger.summary(id).outstandingCents).isZero()
        assertThat(ledger.summary(id).creditCents).isZero()
        assertThat(quotes.history(id, null, 100).items.map { it.quote.price.totalCents })
            .containsExactly(18003, 15003, 10002)
        val corrected =
            stays.correct(
                id,
                version(),
                departed.reservation.checkedInAt!!,
                "2026-11-10T11:55:00.123456Z",
                "Synthetic corrected departure",
                key(),
            )
        assertThat(corrected.inventoryEvent!!.reason).isEqualTo("Synthetic corrected departure")
        assertThat(stays.checkOut(id, expected, false, null, stable)).isEqualTo(departed)
        assertThat(operations.find(OperationKind.CHECK_OUT, stable)).isEqualTo(departed)
        assertThat(inventory.reservation(id).checkedOutAt).isEqualTo("2026-11-10T11:55:00.123456Z")
        assertThat(ledger.history(id, "0", 100).items).hasSize(2).contains(receipt)
        assertThat(readiness.read(destination.id!!).version).isEqualTo(4)
    }

    @Test
    fun earlyAndLateDeparturesRequireAnAcceptedDateChangeFirst() {
        arrive()
        clock.value = Instant.parse("2026-11-08T12:00:00Z")
        assertThat(failure { stays.checkOut(id, version(), true, null, key()) })
            .isEqualTo("CHECK_OUT_DATE")
        val offer = quotes.create(room.id!!, "2026-11-07", "2026-11-08", 2)
        stays.change(
            id,
            offer.startDate,
            offer.endDate,
            2,
            version(),
            offer.id,
            "Synthetic early departure",
            key(),
        )
        stays.checkOut(id, version(), true, "Synthetic outstanding balance retained", key())
        assertThat(ledger.summary(id).outstandingCents).isEqualTo(5001)
        assertThat(quotes.history(id, null, 100).items).hasSize(2)
    }

    @Test
    fun aLateDepartureCanBeExtendedToTodayWithExplicitCurrentRateAcceptance() {
        arrive()
        clock.value = Instant.parse("2026-11-10T12:00:00Z")
        assertThat(failure { stays.checkOut(id, version(), true, null, key()) })
            .isEqualTo("CHECK_OUT_DATE")
        val offer = quotes.create(room.id!!, "2026-11-07", "2026-11-10", 2)
        stays.change(
            id,
            offer.startDate,
            offer.endDate,
            2,
            version(),
            offer.id,
            "Synthetic late departure",
            key(),
        )
        stays.checkOut(id, version(), true, null, key())
    }

    @Test
    fun actualArrivalMustRemainInsideChangedDatesAndInHouseDepartureCannotBeMovedToThePast() {
        arrive()
        clock.value = Instant.parse("2026-11-08T12:00:00Z")
        assertThat(
                failure {
                    stays.change(
                        id,
                        "2026-11-08",
                        "2026-11-10",
                        2,
                        version(),
                        null,
                        "Synthetic",
                        key(),
                    )
                }
            )
            .isEqualTo("ARRIVAL_OUTSIDE_STAY")
        assertThat(
                failure {
                    stays.change(
                        id,
                        "2026-11-06",
                        "2026-11-07",
                        2,
                        version(),
                        null,
                        "Synthetic",
                        key(),
                    )
                }
            )
            .isEqualTo("ARRIVAL_OUTSIDE_STAY")
        clock.value = Instant.parse("2026-11-10T12:00:00Z")
        assertThat(
                failure {
                    stays.change(
                        id,
                        "2026-11-07",
                        "2026-11-09",
                        2,
                        version(),
                        null,
                        "Synthetic",
                        key(),
                    )
                }
            )
            .isEqualTo("DEPARTURE_DATE_PASSED")
    }

    @Test
    fun anInHouseMoveRequiresReviewedDestinationReadinessAndDirtiesTheOldRoomAtomically() {
        arrive()
        val destination =
            rooms.saveAndFlush(
                Apartment(
                    capacity = 4,
                    name = "Synthetic move",
                    reference = "STAY-3",
                    baseRateCents = 6001,
                )
            )
        val offer = quotes.create(destination.id!!, "2026-11-07", "2026-11-09", 2)
        assertThat(
                failure {
                    stays.move(
                        id,
                        destination.id!!,
                        version(),
                        offer.id,
                        null,
                        "Synthetic move",
                        key(),
                    )
                }
            )
            .isEqualTo("READINESS_REVIEW_REQUIRED")
        assertThat(
                failure {
                    stays.move(
                        id,
                        destination.id!!,
                        version(),
                        offer.id,
                        0,
                        "Synthetic move",
                        key(),
                    )
                }
            )
            .isEqualTo("ROOM_NOT_READY")
        val ready = clean(destination.id!!)
        val moved =
            stays.move(id, destination.id!!, version(), offer.id, ready, "Synthetic move", key())
        assertThat(moved.reservation!!.roomId).isEqualTo(destination.id)
        assertThat(moved.reservation.phase).isEqualTo(StayPhase.CHECKED_IN)
        assertThat(moved.inventoryEvent!!.previousRoomId).isEqualTo(room.id)
        assertThat(readiness.read(room.id!!).state).isEqualTo(ReadinessState.DIRTY)
        assertThat(readiness.read(destination.id!!).state).isEqualTo(ReadinessState.CLEAN)
    }

    @Test
    fun sameRoomAndSameStayAreSafeNoopsInHouseAndNeverRepriceOrDirty() {
        arrive()
        val expected = version()
        assertThat(
                stays
                    .move(id, room.id!!, expected, null, null, "Synthetic unchanged room", key())
                    .reservation!!
                    .version
            )
            .isEqualTo(expected)
        assertThat(
                stays
                    .change(
                        id,
                        "2026-11-07",
                        "2026-11-09",
                        2,
                        expected,
                        null,
                        "Synthetic unchanged stay",
                        key(),
                    )
                    .reservation!!
                    .version
            )
            .isEqualTo(expected)
        assertThat(quotes.history(id, null, 100).items).hasSize(1)
        assertThat(readiness.read(room.id!!).state).isEqualTo(ReadinessState.CLEAN)
    }

    @Test
    fun noShowWaitsUntilAfterArrivalAndRetainsFundsAsRefundableCredit() {
        val receipt = ledger.payment(id, 2501, "CASH", "2026-11-07", 0, key()).ledgerEntry!!
        assertThat(failure { stays.noShow(id, version(), "Synthetic no arrival", key()) })
            .isEqualTo("NO_SHOW_DATE")
        clock.value = Instant.parse("2026-11-08T12:00:00Z")
        val saved = stays.noShow(id, version(), "Synthetic no arrival", key())
        assertThat(saved.reservation!!.phase).isEqualTo(StayPhase.NO_SHOW)
        assertThat(saved.reservation.status).isEqualTo(ReservationStatus.CANCELLED)
        assertThat(saved.inventoryEvent!!.reason).isEqualTo("Synthetic no arrival")
        val summary = ledger.summary(id)
        assertThat(summary.accommodationCents).isZero()
        assertThat(summary.creditCents).isEqualTo(2501)
        assertThat(summary.agreedCents).isEqualTo(10002)
        ledger.refund(
            id,
            receipt.id,
            2501,
            "CASH",
            "2026-11-08",
            "Synthetic deposit returned",
            version(),
            key(),
        )
        assertThat(ledger.summary(id).creditCents).isZero()
        assertThat(failure { stays.cancel(id, version(), "Synthetic wrong outcome", key()) })
            .isEqualTo("STAY_NOT_EDITABLE")
    }

    @Test
    fun outstandingCreditAndUnknownBalancesRequireExplicitDepartureAcknowledgement() {
        arrive()
        clock.value = Instant.parse("2026-11-09T12:00:00Z")
        assertThat(failure { stays.checkOut(id, version(), false, null, key()) })
            .isEqualTo("SETTLEMENT_REVIEW_REQUIRED")
        ledger.payment(id, 10102, "BANK_TRANSFER", "2026-11-09", version(), key())
        assertThat(failure { stays.checkOut(id, version(), false, null, key()) })
            .isEqualTo("SETTLEMENT_REVIEW_REQUIRED")
        stays.checkOut(id, version(), true, "Synthetic credit retained", key())
        assertThat(ledger.summary(id).creditCents).isEqualTo(100)
    }

    @Test
    fun completedStaysRejectOrdinaryEditsAndAllowOnlyReasonedActualTimeCorrection() {
        arrive()
        clock.value = Instant.parse("2026-11-09T12:00:00Z")
        stays.checkOut(id, version(), true, null, key())
        assertThat(
                failure {
                    stays.change(
                        id,
                        "2026-11-07",
                        "2026-11-10",
                        2,
                        version(),
                        null,
                        "Synthetic",
                        key(),
                    )
                }
            )
            .isEqualTo("STAY_NOT_EDITABLE")
        assertThat(failure { stays.cancel(id, version(), "Synthetic", key()) })
            .isEqualTo("STAY_NOT_EDITABLE")
        assertThat(
                failure {
                    stays.correct(
                        id,
                        version(),
                        "2026-11-07T12:00:00Z",
                        "2026-11-09T11:00:00Z",
                        " ",
                        key(),
                    )
                }
            )
            .isEqualTo("REASON_REQUIRED")
        val corrected =
            stays.correct(
                id,
                version(),
                "2026-11-07T11:00:00.123456Z",
                "2026-11-09T11:00:00.123456Z",
                "Synthetic actual times",
                key(),
            )
        assertThat(corrected.reservation!!.phase).isEqualTo(StayPhase.CHECKED_OUT)
        assertThat(corrected.inventoryEvent!!.reason).isEqualTo("Synthetic actual times")
        val expected = version()
        assertThat(
                stays
                    .correct(
                        id,
                        expected,
                        corrected.reservation.checkedInAt!!,
                        corrected.reservation.checkedOutAt,
                        "Synthetic unchanged",
                        key(),
                    )
                    .reservation!!
                    .version
            )
            .isEqualTo(expected)
        assertThat(quotes.history(id, null, 100).items).hasSize(1)
    }

    @Test
    fun invalidActualTimesNeverReopenOrCorruptAStay() {
        assertThat(
                failure { stays.correct(id, 0, "2026-11-07T10:00:00Z", null, "Synthetic", key()) }
            )
            .isEqualTo("INVALID_STAY_TRANSITION")
        arrive()
        for ((arrival, departure) in
            listOf(
                "2026-11-06T10:00:00Z" to null,
                "2026-11-08T12:00:00Z" to null,
                "2026-11-07T10:00:00Z" to "2026-11-09T10:00:00Z",
            )) assertThat(
                failure {
                    stays.correct(
                        id,
                        version(),
                        arrival,
                        departure,
                        "Synthetic invalid correction",
                        key(),
                    )
                }
            )
            .isEqualTo("INVALID_OPERATION_TIME")
        clock.value = Instant.parse("2026-11-09T12:00:00Z")
        stays.checkOut(id, version(), true, null, key())
        for (departure in
            listOf(
                null,
                "2026-11-06T10:00:00Z",
                "2026-11-10T10:00:00Z",
                "2026-11-08T10:00:00Z",
            )) assertThat(
                failure {
                    stays.correct(
                        id,
                        version(),
                        "2026-11-07T10:00:00Z",
                        departure,
                        "Synthetic invalid correction",
                        key(),
                    )
                }
            )
            .isEqualTo("INVALID_OPERATION_TIME")
    }

    @Test
    fun twoOwnersCannotBothApplyOneReviewedArrival() {
        val ready = clean()
        val pool = Executors.newFixedThreadPool(2)
        val gate = CyclicBarrier(2)
        try {
            val calls =
                (0..1).map { owner ->
                    pool.submit<String> {
                        SecurityContextHolder.getContext().authentication =
                            StaffAuthentication(TestData.ownerIdentity(owner))
                        try {
                            gate.await(10, TimeUnit.SECONDS)
                            stays.checkIn(id, 0, ready, key())
                            "SAVED"
                        } catch (error: DomainException) {
                            error.code
                        } finally {
                            SecurityContextHolder.clearContext()
                        }
                    }
                }
            assertThat(calls.map { it.get(15, TimeUnit.SECONDS) })
                .containsExactlyInAnyOrder("SAVED", "STALE_VERSION")
            assertThat(
                    jdbc.queryForObject(
                        "SELECT COUNT(*) FROM inventory_events WHERE reservation_id=? AND kind='CHECKED_IN'",
                        Long::class.java,
                        id,
                    )
                )
                .isEqualTo(1)
        } finally {
            pool.shutdownNow()
        }
    }

    @Test
    fun readinessAndArrivalAndOperationRollBackWhenTheInventoryAuditFails() {
        val ready = clean()
        val stable = key()
        jdbc.execute(
            "CREATE OR REPLACE FUNCTION synthetic_stay_failure_fn() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RAISE EXCEPTION 'Synthetic stay failure' USING ERRCODE='45000'; END \$\$; CREATE TRIGGER synthetic_stay_failure BEFORE INSERT ON inventory_events FOR EACH ROW EXECUTE FUNCTION synthetic_stay_failure_fn()"
        )
        try {
            assertThrows<RuntimeException> { stays.checkIn(id, 0, ready, stable) }
        } finally {
            jdbc.execute("DROP TRIGGER synthetic_stay_failure ON inventory_events")
        }
        assertThat(inventory.reservation(id).phase).isEqualTo(StayPhase.CONFIRMED)
        assertThat(
                jdbc.queryForObject(
                    "SELECT COUNT(*) FROM inventory_operations WHERE operation_key=?",
                    Long::class.java,
                    stable,
                )
            )
            .isZero()
        stays.checkIn(id, 0, ready, stable)
    }

    @Test
    fun checkoutAndDirtyStateAndBothAuditsRollBackTogether() {
        arrive()
        clock.value = Instant.parse("2026-11-09T12:00:00Z")
        val expected = version()
        val stable = key()
        jdbc.execute(
            "CREATE OR REPLACE FUNCTION synthetic_checkout_failure_fn() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RAISE EXCEPTION 'Synthetic checkout failure' USING ERRCODE='45000'; END \$\$; CREATE TRIGGER synthetic_checkout_failure BEFORE INSERT ON inventory_events FOR EACH ROW EXECUTE FUNCTION synthetic_checkout_failure_fn()"
        )
        try {
            assertThrows<RuntimeException> { stays.checkOut(id, expected, true, null, stable) }
        } finally {
            jdbc.execute("DROP TRIGGER synthetic_checkout_failure ON inventory_events")
        }
        assertThat(inventory.reservation(id).phase).isEqualTo(StayPhase.CHECKED_IN)
        assertThat(readiness.read(room.id!!).state).isEqualTo(ReadinessState.CLEAN)
        assertThat(readiness.history(room.id!!, "0", 100).items).hasSize(3)
        assertThat(
                jdbc.queryForObject(
                    "SELECT COUNT(*) FROM inventory_operations WHERE operation_key=?",
                    Long::class.java,
                    stable,
                )
            )
            .isZero()
        stays.checkOut(id, expected, true, null, stable)
    }

    @Test
    fun foreignResourcesRevokedActorsAndUnsafeVersionsNeverMutate() {
        TestData.registerBusiness(jdbc, "foreign")
        val foreignRoom = rooms.saveAndFlush(room.copy(id = null, propertyId = "foreign"))
        val foreignGuest =
            guests.saveAndFlush(
                Customer(firstName = "Foreign", lastName = "Synthetic", propertyId = "foreign")
            )
        val foreign =
            reservations.saveAndFlush(
                Reservation(
                    propertyId = "foreign",
                    customerId = foreignGuest.id,
                    roomId = foreignRoom.id,
                    startDate = LocalDate.parse("2026-11-07"),
                    endDate = LocalDate.parse("2026-11-09"),
                )
            )
        assertThat(failure { stays.checkIn(foreign.id!!, 0, 0, key()) }).isEqualTo("NOT_FOUND")
        assertThat(failure { stays.checkIn(id, -1, 0, key()) }).isEqualTo("INVALID_VERSION")
        jdbc.update("UPDATE reservations SET version=? WHERE id=?", EuroCents.MAX, id)
        assertThat(failure { stays.checkIn(id, EuroCents.MAX, 0, key()) })
            .isEqualTo("VERSION_LIMIT")
        jdbc.update(
            "UPDATE staff_accounts SET active=FALSE WHERE id=?",
            TestData.ownerIdentity().id,
        )
        assertThrows<RuntimeException> { stays.checkIn(id, EuroCents.MAX, 0, key()) }
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
