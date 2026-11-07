package com.villarosa

import com.villarosa.exception.DomainException
import com.villarosa.repository.*
import com.villarosa.repository.model.*
import com.villarosa.service.*
import java.time.Instant
import java.util.UUID
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.*
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
            "INSERT INTO seasonal_rates(id,property_id,room_id,name,start_date,end_date,nightly_cents) VALUES(?,?,?,?,?,?,?)",
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
            "INSERT INTO reservations(property_id,customer_id,room_id,start_date,end_date,guest_count,status,stay_phase,version) VALUES(?,?,?,?,?,?,'ACTIVE','CONFIRMED',0)",
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
            .startsWith("\uFEFF\"report\"")
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
            registry.add("spring.session.jdbc.initialize-schema") { "never" }
            registry.add("spring.datasource.url", database::getJdbcUrl)
            registry.add("spring.datasource.username", database::getUsername)
            registry.add("spring.datasource.password", database::getPassword)
            registry.add("spring.datasource.driver-class-name", database::getDriverClassName)
            registry.add("spring.jpa.hibernate.ddl-auto") { "validate" }
        }
    }
}
