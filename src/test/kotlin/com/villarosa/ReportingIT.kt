package com.villarosa

import com.villarosa.exception.DomainException
import com.villarosa.repository.*
import com.villarosa.repository.model.*
import com.villarosa.security.StaffAuthentication
import com.villarosa.service.*
import java.time.Instant
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.*
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
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
@Import(PriceClockConfiguration::class)
@Testcontainers
class ReportingIT
@Autowired
constructor(
    private val reports: PeriodReports,
    private val dashboard: TodayDashboard,
    private val ledger: LedgerService,
    private val inventory: ReservationService,
    private val quotes: QuoteService,
    private val stays: StayOperations,
    private val readiness: ReadinessService,
    private val rooms: ApartmentRepository,
    private val guests: CustomerRepository,
    private val clock: MutablePriceClock,
    private val jdbc: JdbcTemplate,
) {
    @MockitoSpyBean private lateinit var dailySnapshot: DailyOperations
    @MockitoSpyBean private lateinit var storeSnapshot: ReportingStore
    private lateinit var a: Apartment
    private lateinit var b: Apartment
    private var guest = 0

    private fun key() = UUID.randomUUID().toString()

    @BeforeEach
    fun fixtures() {
        TestData.reset(jdbc, database.jdbcUrl)
        clock.value = Instant.parse("2026-11-07T12:00:00Z")
        a =
            rooms.saveAndFlush(
                Apartment(
                    capacity = 4,
                    name = "Synthetic blue",
                    reference = "REP-A",
                    baseRateCents = 5001,
                )
            )
        b =
            rooms.saveAndFlush(
                Apartment(
                    capacity = 4,
                    name = "Synthetic green",
                    reference = "REP-B",
                    baseRateCents = 6001,
                )
            )
        guest =
            guests
                .saveAndFlush(
                    Customer(
                        firstName = "Синтетички",
                        lastName = "Гост",
                        phone = "123456",
                        email = "private@example.test",
                        notes = "Private synthetic note",
                    )
                )
                .id!!
    }

    private fun book(
        room: Apartment = a,
        start: String = "2026-11-07",
        end: String = "2026-11-10",
    ): Int {
        val q = quotes.create(room.id!!, start, end, 2)
        return inventory.createQuoted(guest, q.id, room.id!!, start, end, 2, key()).resourceId
    }

    private fun report(
        kind: ReportKind,
        start: String = "2026-11-07",
        end: String = "2026-11-10",
        room: Int? = null,
    ) = reports.read(kind, start, end, room)

    private fun version(id: Int) = inventory.reservation(id).version

    private fun pay(id: Int, amount: Long, date: String = "2026-11-07") =
        ledger.payment(id, amount, "CASH", date, version(id), key()).ledgerEntry!!

    private fun clean(room: Apartment): Long {
        var v = readiness.read(room.id!!).version
        for (state in
            listOf(ReadinessState.IN_PROGRESS, ReadinessState.INSPECTION, ReadinessState.CLEAN)) v =
            readiness.change(room.id!!, state, v, key(), null).readiness!!.version
        return v
    }

    @Test
    fun occupancyUsesBookedAllocationNightsAndUnionsMaintenanceWithoutSubtractingReadiness() {
        book()
        inventory.block(b.id!!, "2026-11-08", "2026-11-10", "Synthetic repair", key())
        val result = report(ReportKind.OCCUPANCY)
        assertThat(result.totals)
            .isEqualTo(
                ReportTotals(
                    roomNights = 6,
                    blockedNights = 2,
                    sellableNights = 4,
                    bookedNights = 3,
                )
            )
        assertThat(result.notices).containsExactly("CURRENT_INVENTORY_BASIS")
        assertThat(result.occupancy.map { it.bookedNights }).containsExactly(3, 0)
        assertThat(dashboard.read().dirtyRooms).isEqualTo(2)
    }

    @Test
    fun cancellationAndNoShowRemoveNightsAndChargesButRetainHeldCredit() {
        val cancelled = book(a)
        val noShow = book(b)
        pay(cancelled, 3000)
        pay(noShow, 2000)
        stays.cancel(cancelled, version(cancelled), "Synthetic cancellation", key())
        clock.value = Instant.parse("2026-11-08T12:00:00Z")
        stays.noShow(noShow, version(noShow), "Synthetic no show", key())
        assertThat(report(ReportKind.OCCUPANCY).totals.bookedNights).isZero()
        assertThat(report(ReportKind.CHARGES).totals.chargeCents).isZero()
        val balances = report(ReportKind.BALANCES)
        assertThat(balances.totals.outstandingCents).isZero()
        assertThat(balances.totals.creditCents).isEqualTo(5000)
        for (row in balances.balances) assertThat(row.creditCents)
            .isEqualTo(ledger.summary(row.reservationId).creditCents)
    }

    @Test
    fun savedNightlyLinesAreClippedAndCurrentRateChangesDoNotAlterAgreedCharges() {
        jdbc.update(
            "INSERT INTO seasonal_rates(id,property_id,room_id,name,start_date,end_date,nightly_cents) VALUES(?,?,?,?,CAST(? AS DATE),CAST(? AS DATE),?)",
            key(),
            PropertyScope.ID,
            a.id,
            "Synthetic season",
            "2026-11-08",
            "2026-11-09",
            7003,
        )
        val id = book()
        assertThat(report(ReportKind.CHARGES).totals.chargeCents).isEqualTo(17005)
        assertThat(report(ReportKind.CHARGES, "2026-11-08", "2026-11-09").totals.chargeCents)
            .isEqualTo(7003)
        jdbc.update("UPDATE apartments SET base_rate_cents=99999 WHERE id=?", a.id)
        assertThat(report(ReportKind.CHARGES).charges.single().quoteId)
            .isEqualTo(quotes.currentPrice(id)!!.quote.id)
        assertThat(report(ReportKind.CHARGES).totals.chargeCents).isEqualTo(17005)
    }

    @Test
    fun inHouseMoveSplitsRoomNightsAndAppliesTheLatestWholeStayAgreement() {
        val id = book()
        stays.checkIn(id, version(id), clean(a), key())
        clock.value = Instant.parse("2026-11-08T12:00:00Z")
        val q = quotes.create(b.id!!, "2026-11-07", "2026-11-10", 2)
        stays.move(id, b.id!!, version(id), q.id, clean(b), "Synthetic move", key())
        val result = report(ReportKind.OCCUPANCY)
        assertThat(result.occupancy.map { it.bookedNights }).containsExactly(1, 2)
        assertThat(report(ReportKind.CHARGES).charges.map { it.chargeCents })
            .containsExactly(6001, 12002)
        assertThat(report(ReportKind.CHARGES, room = a.id).totals.chargeCents).isEqualTo(6001)
        assertThat(report(ReportKind.BALANCES, room = a.id).totals.outstandingCents)
            .isEqualTo(18003)
        pay(id, 1000)
        assertThat(report(ReportKind.COLLECTIONS, room = a.id).totals.collectedCents)
            .isEqualTo(1000)
    }

    @Test
    fun correctedCollectionsRetainReversedRowsButCountOnlyEffectiveMoney() {
        val id = book()
        val receipt = pay(id, 10000, "2026-11-06")
        val refund =
            ledger
                .refund(
                    id,
                    receipt.id,
                    1500,
                    "BANK_TRANSFER",
                    "2026-11-07",
                    "Synthetic return",
                    version(id),
                    key(),
                )
                .ledgerEntry!!
        assertThat(report(ReportKind.COLLECTIONS).totals.netCollectedCents).isEqualTo(-1500)
        ledger.reverse(id, refund.id, "Synthetic correction", version(id), key())
        val result = report(ReportKind.COLLECTIONS, "2026-11-06", "2026-11-08")
        assertThat(result.collections).hasSize(3)
        assertThat(result.totals.collectedCents).isEqualTo(10000)
        assertThat(result.totals.refundedCents).isZero()
        assertThat(result.collections.single { it.entryId == refund.id }.reversedById).isNotNull()
        assertThat(result.collections.sumOf { it.collectedCents - it.refundedCents })
            .isEqualTo(ledger.summary(id).totals.receivedCents)
        assertThat(result.collections.single { it.kind == "REVERSAL" }.reversesId)
            .isEqualTo(refund.id)
    }

    @Test
    fun periodEndIsExclusiveForMoneyAndBookingsAndFutureDepositsUseReceiptDates() {
        val id = book(start = "2030-01-01", end = "2030-01-03")
        pay(id, 1000)
        assertThat(report(ReportKind.CHARGES).charges).isEmpty()
        assertThat(report(ReportKind.COLLECTIONS).totals.collectedCents).isEqualTo(1000)
        assertThat(report(ReportKind.COLLECTIONS, "2026-11-06", "2026-11-07").collections).isEmpty()
        assertThat(report(ReportKind.BALANCES, "2030-01-03", "2030-01-04").balances).isEmpty()
    }

    @Test
    fun unknownLegacyPricesAreNeverConvertedToZeroOrCompleteTotals() {
        jdbc.update(
            "INSERT INTO reservations(property_id,customer_id,room_id,start_date,end_date,guest_count,status,stay_phase,version) VALUES(?,?,?,CAST(? AS DATE),CAST(? AS DATE),?,'ACTIVE','CONFIRMED',0)",
            PropertyScope.ID,
            guest,
            a.id,
            "2026-11-07",
            "2026-11-08",
            1,
        )
        val charges = report(ReportKind.CHARGES)
        assertThat(charges.totals.chargeCents).isNull()
        assertThat(charges.totals.unknownPriceCount).isEqualTo(1)
        assertThat(charges.charges.single().chargeCents).isNull()
        assertThat(report(ReportKind.BALANCES).totals.outstandingCents).isNull()
        assertThat(dashboard.read().balances.unknownCount).isEqualTo(1)
    }

    @Test
    fun archivedRoomsRetainSourceNightsButDoNotInventCurrentSellableCapacity() {
        val id = book()
        jdbc.update(
            "UPDATE reservations SET stay_phase='CHECKED_OUT',checked_in_at='2026-11-07 12:00:00',checked_out_at='2026-11-10 12:00:00' WHERE id=?",
            id,
        )
        jdbc.update("UPDATE apartments SET active=FALSE WHERE id=?", a.id)
        val report = report(ReportKind.OCCUPANCY)
        assertThat(report.occupancy.first().bookedNights).isEqualTo(3)
        assertThat(report.occupancy.first().sellableNights).isZero()
        assertThat(report.totals.bookedNights).isZero()
        assertThat(report.totals.sellableNights).isEqualTo(3)
        assertThat(report(ReportKind.BALANCES).totals.outstandingCents).isEqualTo(15003)
    }

    @Test
    fun todayCountsTheWholeQueueAndUsesPropertyMidnightRatherThanTheUtcDate() {
        for (i in 1..7) {
            val room =
                rooms.saveAndFlush(
                    Apartment(
                        capacity = 2,
                        name = "Synthetic queue $i",
                        reference = "QUEUE-$i",
                        baseRateCents = 100,
                    )
                )
            book(room, "2026-11-08", "2026-11-09")
        }
        clock.value = Instant.parse("2026-11-07T23:00:00Z")
        val today = dashboard.read()
        assertThat(today.propertyDate).isEqualTo("2026-11-08")
        assertThat(today.arrivals.count).isEqualTo(7)
        assertThat(today.arrivals.items).hasSize(5)
        assertThat(today.balances.outstandingCount).isEqualTo(7)
        assertThat(today.balances.outstandingCents).isEqualTo(700)
        assertThat(today.balances.items).hasSize(5)
        assertThat(today.activeRooms).isEqualTo(9)
        assertThat(today.dirtyRooms).isEqualTo(9)
    }

    @Test
    fun daylightSavingNightsAreCalendarDaysAndReadTimesRemainUtc() {
        book(start = "2026-03-28", end = "2026-03-31")
        assertThat(report(ReportKind.CHARGES, "2026-03-28", "2026-03-31").totals.chargeCents)
            .isEqualTo(15003)
        clock.value = Instant.parse("2026-03-28T23:00:00Z")
        assertThat(dashboard.read().propertyDate).isEqualTo("2026-03-29")
        clock.value = Instant.parse("2026-10-25T01:30:00Z")
        assertThat(dashboard.read().propertyDate).isEqualTo("2026-10-25")
        assertThat(dashboard.read().readAt).isEqualTo("2026-10-25T01:30:00Z")
    }

    @Test
    fun exportRequiresAnUnchangedCompleteSnapshotAndRetainsUnicodeWithoutContacts() {
        val id = book()
        val original = report(ReportKind.CHARGES)
        val csv =
            reports
                .csv(original.kind, original.startDate, original.endDate, null, original.snapshotId)
                .toString(Charsets.UTF_8)
        assertThat(csv)
            .startsWith("\uFEFF\"record_type\"")
            .contains("Синтетички Гост")
            .doesNotContain("private@example.test", "Private synthetic note", "123456")
        pay(id, 100)
        val balance = report(ReportKind.BALANCES)
        pay(id, 100)
        assertThat(
                assertThrows<DomainException> {
                        reports.csv(
                            balance.kind,
                            balance.startDate,
                            balance.endDate,
                            null,
                            balance.snapshotId,
                        )
                    }
                    .code
            )
            .isEqualTo("REPORT_CHANGED")
    }

    @Test
    fun propertyScopeRevocationAndQueryLimitsApplyToReportsAndExports() {
        val foreignRoom =
            rooms.saveAndFlush(a.copy(id = null, propertyId = "foreign", reference = "FOREIGN"))
        assertThat(report(ReportKind.OCCUPANCY).occupancy.map { it.roomId })
            .doesNotContain(foreignRoom.id)
        assertThrows<DomainException> { report(ReportKind.CHARGES, room = foreignRoom.id) }
        assertThrows<DomainException> { report(ReportKind.CHARGES, "2026-01-01", "2028-01-01") }
        assertThrows<DomainException> { report(ReportKind.CHARGES, room = -1) }
        jdbc.update(
            "UPDATE staff_accounts SET security_version=1 WHERE id=?",
            TestData.ownerIdentity().id,
        )
        assertThrows<DomainException> { dashboard.read() }
        assertThrows<DomainException> { report(ReportKind.CHARGES) }
        assertThrows<DomainException> {
            reports.csv(ReportKind.CHARGES, "2026-11-07", "2026-11-10", null, "invalid")
        }
    }

    @Test
    fun largeReportsFailBeforeReturningTruncatedRows() {
        for (i in 1..499) jdbc.update(
            "INSERT INTO apartments(property_id,capacity,name,reference,active,version,rate_version,rate_currency) VALUES(?,1,?,?,TRUE,0,0,'EUR')",
            PropertyScope.ID,
            "Synthetic bound $i",
            "BOUND-$i",
        )
        assertThat(assertThrows<DomainException> { report(ReportKind.OCCUPANCY) }.code)
            .isEqualTo("REPORT_TOO_LARGE")
        assertThat(report(ReportKind.OCCUPANCY, room = a.id).occupancy).hasSize(1)
    }

    @Test
    fun corruptAcceptedPriceFailsWithASafeErrorRatherThanAFalseTotal() {
        val id = book()
        jdbc.update("UPDATE reservation_prices SET quote_json='{}' WHERE reservation_id=?", id)
        val ex = assertThrows<DomainException> { report(ReportKind.CHARGES) }
        assertThat(ex.code).isEqualTo("REPORT_SOURCE_INCOMPLETE")
        assertThat(ex.message).doesNotContain("Синтетички", "private@example.test")
    }

    @Test
    fun unsafeAggregateMoneyIsRejectedRatherThanRounded() {
        jdbc.update(
            "UPDATE apartments SET base_rate_cents=? WHERE id IN (?,?)",
            EuroCents.MAX,
            a.id,
            b.id,
        )
        book(a, end = "2026-11-08")
        book(b, end = "2026-11-08")
        assertThat(assertThrows<DomainException> { report(ReportKind.BALANCES) }.code)
            .isEqualTo("REPORT_AMOUNT_LIMIT")
        assertThat(assertThrows<DomainException> { dashboard.read() }.code)
            .isEqualTo("REPORT_AMOUNT_LIMIT")
    }

    @Test
    fun acceptedSnapshotsRemainAuthoritativeWhenTheQuoteTableTotalDrifts() {
        val id = book()
        jdbc.update(
            "UPDATE booking_quotes SET total_cents=99999 WHERE id=?",
            quotes.currentPrice(id)!!.quote.id,
        )
        assertThat(report(ReportKind.CHARGES).totals.chargeCents).isEqualTo(15003)
        assertThat(report(ReportKind.BALANCES).totals.outstandingCents)
            .isEqualTo(ledger.summary(id).outstandingCents)
        assertThat(dashboard.read().balances.outstandingCents).isEqualTo(15003)
    }

    @Test
    fun malformedMissingAndNonintegerAcceptedTotalsFailAllFinancialViews() {
        val id = book()
        val original =
            jdbc.queryForObject(
                "SELECT quote_json FROM reservation_prices WHERE reservation_id=?",
                String::class.java,
                id,
            )!!
        assertThat(original).contains("\"totalCents\":15003")
        for (value in
            listOf("null", "\"15003\"", "15003.0", "1.5003e4", "0", "-1", "9007199254740992")) {
            jdbc.update(
                "UPDATE reservation_prices SET quote_json=? WHERE reservation_id=?",
                original.replace("\"totalCents\":15003", "\"totalCents\":$value"),
                id,
            )
            for (kind in listOf(ReportKind.CHARGES, ReportKind.BALANCES)) assertThat(
                    assertThrows<DomainException> { report(kind) }.code
                )
                .isEqualTo("REPORT_SOURCE_INCOMPLETE")
            assertThat(assertThrows<DomainException> { dashboard.read() }.code)
                .isEqualTo("REPORT_SOURCE_INCOMPLETE")
        }
        jdbc.update("UPDATE reservation_prices SET quote_json='{}' WHERE reservation_id=?", id)
        assertThat(assertThrows<DomainException> { dashboard.read() }.code)
            .isEqualTo("REPORT_SOURCE_INCOMPLETE")
        jdbc.update("DELETE FROM reservation_prices WHERE reservation_id=?", id)
        assertThat(assertThrows<DomainException> { report(ReportKind.BALANCES) }.code)
            .isEqualTo("REPORT_SOURCE_INCOMPLETE")
        assertThat(assertThrows<DomainException> { dashboard.read() }.code)
            .isEqualTo("REPORT_SOURCE_INCOMPLETE")
    }

    @Test
    fun exportedLedgerIdsBeyondJavascriptPrecisionRetainTheirDecimalText() {
        val id = book()
        val entry = pay(id, 1000)
        jdbc.update("UPDATE ledger_entries SET id=9007199254740993 WHERE id=?", entry.id.toLong())
        val result = report(ReportKind.COLLECTIONS)
        assertThat(result.collections.single().entryId).isEqualTo("9007199254740993")
        assertThat(
                reports
                    .csv(result.kind, result.startDate, result.endDate, null, result.snapshotId)
                    .toString(Charsets.UTF_8)
            )
            .contains("\"'9007199254740993\"")
    }

    private fun concurrent(action: () -> Unit) {
        val executor = Executors.newSingleThreadExecutor()
        try {
            executor
                .submit {
                    SecurityContextHolder.getContext().authentication =
                        StaffAuthentication(TestData.ownerIdentity())
                    try {
                        action()
                    } finally {
                        SecurityContextHolder.clearContext()
                    }
                }
                .get(20, TimeUnit.SECONDS)
        } finally {
            executor.shutdownNow()
        }
    }

    @Test
    fun partialAndOverlappingAllocationSourcesCannotSilentlyChangeChargeTotals() {
        val id = book()
        jdbc.update(
            "UPDATE reservation_allocations SET end_date='2026-11-09' WHERE reservation_id=?",
            id,
        )
        assertThat(assertThrows<DomainException> { report(ReportKind.CHARGES) }.code)
            .isEqualTo("REPORT_SOURCE_INCOMPLETE")
        assertThat(assertThrows<DomainException> { report(ReportKind.CHARGES, room = a.id) }.code)
            .isEqualTo("REPORT_SOURCE_INCOMPLETE")
        jdbc.update(
            "INSERT INTO reservation_allocations(property_id,reservation_id,room_id,start_date,end_date) VALUES(?,?,?,CAST(? AS DATE),CAST(? AS DATE))",
            PropertyScope.ID,
            id,
            b.id,
            "2026-11-08",
            "2026-11-10",
        )
        assertThat(assertThrows<DomainException> { report(ReportKind.CHARGES) }.code)
            .isEqualTo("REPORT_SOURCE_INCOMPLETE")
        assertThat(assertThrows<DomainException> { report(ReportKind.OCCUPANCY) }.code)
            .isEqualTo("REPORT_SOURCE_INCOMPLETE")
    }

    @Test
    fun aRoomFilterCannotHideAWholeWindowAllocationGap() {
        val id = book()
        pay(id, 1000)
        jdbc.update(
            "UPDATE reservation_allocations SET end_date='2026-11-08' WHERE reservation_id=?",
            id,
        )
        for (kind in
            listOf(ReportKind.CHARGES, ReportKind.OCCUPANCY, ReportKind.BALANCES)) assertThat(
                assertThrows<DomainException> { report(kind, "2026-11-08", "2026-11-09", a.id) }
                    .code
            )
            .isEqualTo("REPORT_SOURCE_INCOMPLETE")
        assertThat(
                assertThrows<DomainException> {
                        report(ReportKind.COLLECTIONS, "2026-11-07", "2026-11-08", a.id)
                    }
                    .code
            )
            .isEqualTo("REPORT_SOURCE_INCOMPLETE")
        jdbc.update(
            "INSERT INTO reservation_allocations(property_id,reservation_id,room_id,start_date,end_date) VALUES(?,?,?,CAST(? AS DATE),CAST(? AS DATE))",
            PropertyScope.ID,
            id,
            b.id,
            "2026-11-08",
            "2026-11-10",
        )
        assertThat(report(ReportKind.CHARGES, "2026-11-08", "2026-11-09", a.id).totals.chargeCents)
            .isZero()
        assertThat(report(ReportKind.BALANCES, "2026-11-08", "2026-11-09", a.id).balances).isEmpty()
        assertThat(
                report(ReportKind.COLLECTIONS, "2026-11-07", "2026-11-08", a.id)
                    .totals
                    .collectedCents
            )
            .isEqualTo(1000)
        assertThat(
                report(ReportKind.COLLECTIONS, "2026-11-07", "2026-11-08", b.id)
                    .totals
                    .collectedCents
            )
            .isEqualTo(1000)
    }

    @Test
    fun unrelatedAcceptedPriceDamageDoesNotChangeRoomScopedMoneyOrBookedOccupancy() {
        book(a)
        val damaged = book(b)
        jdbc.update("UPDATE reservation_prices SET quote_json='{}' WHERE reservation_id=?", damaged)
        assertThat(report(ReportKind.CHARGES, room = a.id).totals.chargeCents).isEqualTo(15003)
        assertThat(report(ReportKind.OCCUPANCY).totals.bookedNights).isEqualTo(6)
    }

    @Test
    fun collectionCorrectionsOutsideThePeriodRestateTheOriginalReceiptDate() {
        val id = book()
        val receipt = pay(id, 1000, "2026-11-06")
        assertThat(report(ReportKind.COLLECTIONS, "2026-11-06", "2026-11-07").totals.collectedCents)
            .isEqualTo(1000)
        ledger.reverse(id, receipt.id, "Synthetic later correction", version(id), key())
        val earlier = report(ReportKind.COLLECTIONS, "2026-11-06", "2026-11-07")
        assertThat(earlier.collections).hasSize(1)
        assertThat(earlier.collections.single().reversedById).isNotNull()
        assertThat(earlier.totals.collectedCents).isZero()
    }

    private fun rawBookings(count: Int, days: Int = 1): List<Int> {
        jdbc.batchUpdate(
            "INSERT INTO reservations(property_id,customer_id,room_id,start_date,end_date,guest_count,status,stay_phase,version) VALUES(?,?,?,CAST(? AS DATE),CAST(? AS DATE),1,'ACTIVE','CONFIRMED',0)",
            (1..count).map {
                arrayOf<Any>(
                    PropertyScope.ID,
                    guest,
                    a.id!!,
                    "2026-11-07",
                    java.time.LocalDate.parse("2026-11-07").plusDays(days.toLong()).toString(),
                )
            },
        )
        return jdbc
            .queryForList(
                "SELECT id FROM reservations WHERE property_id=? ORDER BY id",
                Int::class.java,
                PropertyScope.ID,
            )
            .map { checkNotNull(it) }
    }

    @Test
    fun bookingBoundsAcceptTheMaximumAndRejectTheNextCompleteRecord() {
        rawBookings(ReportingStore.MAX_BOOKINGS)
        assertThat(report(ReportKind.CHARGES).charges).hasSize(ReportingStore.MAX_BOOKINGS)
        rawBookings(1)
        assertThat(assertThrows<DomainException> { report(ReportKind.CHARGES) }.code)
            .isEqualTo("REPORT_TOO_LARGE")
    }

    @Test
    fun allocationBoundsAcceptTheMaximumAndRejectTheNextCompleteRecord() {
        val ids = rawBookings(1000, 10)
        val first = java.time.LocalDate.parse("2026-11-07")
        jdbc.batchUpdate(
            "INSERT INTO reservation_allocations(property_id,reservation_id,room_id,start_date,end_date) VALUES(?,?,?,CAST(? AS DATE),CAST(? AS DATE))",
            ids.flatMap { id ->
                (0..9).map { day ->
                    arrayOf<Any>(
                        PropertyScope.ID,
                        id,
                        if (day % 2 == 0) a.id!! else b.id!!,
                        first.plusDays(day.toLong()).toString(),
                        first.plusDays(day + 1L).toString(),
                    )
                }
            },
        )
        assertThat(report(ReportKind.CHARGES, end = "2026-11-17").charges)
            .hasSize(ReportingStore.MAX_ALLOCATIONS)
        rawBookings(1)
        assertThat(
                assertThrows<DomainException> { report(ReportKind.CHARGES, end = "2026-11-17") }
                    .code
            )
            .isEqualTo("REPORT_TOO_LARGE")
    }

    @Test
    fun ledgerBoundsAcceptTheMaximumAndRejectTheNextEntry() {
        val id = book()
        val sql =
            "INSERT INTO ledger_entries(property_id,reservation_id,reservation_version,actor_id,operation_key,kind,currency,amount_cents,method,effective_date,recorded_at) VALUES(?,?,?,?,?,'PAYMENT','EUR',1,'CASH','2026-11-07','2026-11-07 12:00:00')"
        jdbc.batchUpdate(
            sql,
            (1..ReportingStore.MAX_ENTRIES).map { n ->
                arrayOf<Any>(PropertyScope.ID, id, n, TestData.ownerIdentity().id, key())
            },
        )
        assertThat(report(ReportKind.COLLECTIONS).collections).hasSize(ReportingStore.MAX_ENTRIES)
        jdbc.update(
            sql,
            PropertyScope.ID,
            id,
            ReportingStore.MAX_ENTRIES + 1,
            TestData.ownerIdentity().id,
            key(),
        )
        assertThat(assertThrows<DomainException> { report(ReportKind.COLLECTIONS) }.code)
            .isEqualTo("REPORT_TOO_LARGE")
    }

    @Test
    fun todayCountsAndExamplesKeepOneSnapshotAcrossAConcurrentArrivalAndPayment() {
        val id = book()
        val target =
            org.springframework.test.util.AopTestUtils.getUltimateTargetObject<DailyOperations>(
                dailySnapshot
            )
        Mockito.doAnswer { invocation ->
                concurrent {
                    book(b)
                    pay(id, 1000)
                }
                invocation.callRealMethod()
            }
            .`when`(target)
            .deskSnapshot(FrontDeskList.ARRIVALS, 0, 5, "2026-11-07")
        try {
            val before = dashboard.read()
            assertThat(before.arrivals.count).isEqualTo(1)
            assertThat(before.arrivals.items).hasSize(1)
            assertThat(before.balances.outstandingCents).isEqualTo(15003)
        } finally {
            Mockito.reset(target)
        }
        assertThat(dashboard.read().arrivals.count).isEqualTo(2)
        assertThat(dashboard.read().balances.outstandingCents).isEqualTo(32006)
    }

    @Test
    fun periodTotalsAndSourceRowsKeepOneSnapshotAcrossAConcurrentPayment() {
        val id = book()
        Mockito.doAnswer { invocation ->
                val result = invocation.callRealMethod()
                concurrent { pay(id, 2000) }
                result
            }
            .`when`(storeSnapshot)
            .rooms(null)
        try {
            assertThat(report(ReportKind.BALANCES).totals.outstandingCents).isEqualTo(15003)
        } finally {
            Mockito.reset(storeSnapshot)
        }
        assertThat(report(ReportKind.BALANCES).totals.outstandingCents).isEqualTo(13003)
    }

    @Test
    fun allocationsAndCurrentPriceRemainOneSnapshotAcrossAConcurrentMoveAndRepricing() {
        val id = book()
        val dates = StayDates.parse("2026-11-07", "2026-11-10")
        Mockito.doAnswer { invocation ->
                val result = invocation.callRealMethod()
                concurrent {
                    val q = quotes.create(b.id!!, "2026-11-07", "2026-11-10", 2)
                    stays.move(id, b.id!!, version(id), q.id, 0, "Synthetic concurrent move", key())
                }
                result
            }
            .`when`(storeSnapshot)
            .windows(dates)
        val original =
            try {
                report(ReportKind.CHARGES)
            } finally {
                Mockito.reset(storeSnapshot)
            }
        assertThat(original.charges.single().roomId).isEqualTo(a.id)
        assertThat(original.totals.chargeCents).isEqualTo(15003)
        assertThat(report(ReportKind.CHARGES).charges.single().roomId).isEqualTo(b.id)
        assertThat(report(ReportKind.CHARGES).totals.chargeCents).isEqualTo(18003)
        assertThat(
                assertThrows<DomainException> {
                        reports.csv(
                            original.kind,
                            original.startDate,
                            original.endDate,
                            null,
                            original.snapshotId,
                        )
                    }
                    .code
            )
            .isEqualTo("REPORT_CHANGED")
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
