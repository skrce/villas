package com.villarosa

import com.villarosa.exception.DomainException
import com.villarosa.repository.*
import com.villarosa.repository.model.*
import com.villarosa.service.*
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
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
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
class ManualLedgerIT
@Autowired
constructor(
    private val ledger: LedgerService,
    private val quotes: QuoteService,
    private val inventory: ReservationService,
    private val operations: OperationCoordinator,
    private val reservations: ReservationRepository,
    private val rooms: ApartmentRepository,
    private val guests: CustomerRepository,
    private val time: PropertyTime,
    private val jdbc: JdbcTemplate,
) {
    private var booking = 0
    private var guest = 0
    private lateinit var room: Apartment

    private fun key() = UUID.randomUUID().toString()

    private fun today() = time.today().toString()

    private fun version() = ledger.summary(booking).reservation.version

    @BeforeEach
    fun fixtures() {
        TestData.reset(jdbc, database.jdbcUrl)
        TestData.seedOwner(jdbc, index = 1)
        room = rooms.saveAndFlush(Apartment(capacity = 4, baseRateCents = 5001, rateVersion = 1))
        guest = guests.saveAndFlush(Customer(firstName = "Synthetic", lastName = "Ledger")).id!!
        val quote = quotes.create(room.id!!, "2030-01-01", "2030-01-03", 2)
        booking =
            inventory
                .createQuoted(guest, quote.id, room.id!!, quote.startDate, quote.endDate, 2, key())
                .resourceId
    }

    private fun pay(amount: Long, expected: Long = version(), stable: String = key()) =
        ledger.payment(booking, amount, "CASH", today(), expected, stable)

    private fun refund(
        payment: String,
        amount: Long,
        expected: Long = version(),
        stable: String = key(),
    ) =
        ledger.refund(
            booking,
            payment,
            amount,
            "BANK_TRANSFER",
            today(),
            "Synthetic refund",
            expected,
            stable,
        )

    @Test
    fun depositsPartialPaymentsAndOverpaymentsRetainExactAgreementsAndFunds() {
        assertThat(ledger.summary(booking).agreedCents).isEqualTo(10002)
        pay(2501)
        pay(7501)
        pay(100)
        val summary = ledger.summary(booking)
        assertThat(summary.totals).isEqualTo(LedgerTotals(10102, 0, 10102))
        assertThat(summary.reservation.version).isEqualTo(3)
        assertThat(summary.agreedCents).isEqualTo(10002)
        assertThat(summary.accommodationCents).isEqualTo(10002)
        assertThat(summary.outstandingCents).isZero()
        assertThat(summary.creditCents).isEqualTo(100)
        assertThat(quotes.history(booking, null, 100).items).hasSize(1)
        assertThat(inventory.reservation(booking).version).isEqualTo(3)
    }

    @Test
    fun refundAllocationsCannotExceedTheirActualUnreversedReceipt() {
        val first = pay(3000).ledgerEntry!!
        pay(7002)
        refund(first.id, 2000)
        assertThat(assertThrows<DomainException> { refund(first.id, 1001) }.code)
            .isEqualTo("REFUND_EXCEEDS_RECEIVED")
        refund(first.id, 1000)
        assertThat(ledger.summary(booking).totals).isEqualTo(LedgerTotals(10002, 3000, 7002))
        assertThat(
                ledger
                    .refundable(booking, "0", 10)
                    .items
                    .find { it.entry.id == first.id }!!
                    .refundableCents
            )
            .isZero()
    }

    @Test
    fun correctionsAreLinkedFullReversalsAndNeverChangeTheOriginalRows() {
        val payment = pay(10002).ledgerEntry!!
        val returned = refund(payment.id, 500).ledgerEntry!!
        assertThat(
                assertThrows<DomainException> {
                        ledger.reverse(
                            booking,
                            payment.id,
                            "Synthetic wrong receipt",
                            version(),
                            key(),
                        )
                    }
                    .code
            )
            .isEqualTo("PAYMENT_HAS_REFUNDS")
        val refundReversal =
            ledger
                .reverse(booking, returned.id, "Synthetic wrong refund record", version(), key())
                .ledgerEntry!!
        assertThat(refundReversal.reversesId).isEqualTo(returned.id)
        assertThat(refundReversal.amountCents).isEqualTo(500)
        assertThat(ledger.summary(booking).totals).isEqualTo(LedgerTotals(10002, 0, 10002))
        ledger.reverse(booking, payment.id, "Synthetic wrong receipt", version(), key())
        assertThat(ledger.summary(booking).totals).isEqualTo(LedgerTotals(0, 0, 0))
        assertThat(ledger.history(booking, "0", 100).items).hasSize(4).contains(payment, returned)
        assertThat(ledger.refundable(booking, "0", 100).items).isEmpty()
        assertThat(assertThrows<DomainException> { refund(payment.id, 1) }.code)
            .isEqualTo("PAYMENT_UNAVAILABLE")
        assertThat(assertThrows<DomainException> { refund(returned.id, 1) }.code)
            .isEqualTo("PAYMENT_UNAVAILABLE")
        assertThat(
                assertThrows<DomainException> {
                        ledger.reverse(booking, payment.id, "Synthetic retry", version(), key())
                    }
                    .code
            )
            .isEqualTo("ENTRY_ALREADY_REVERSED")
        assertThat(
                assertThrows<DomainException> {
                        ledger.reverse(
                            booking,
                            refundReversal.id,
                            "Synthetic retry",
                            version(),
                            key(),
                        )
                    }
                    .code
            )
            .isEqualTo("ENTRY_ALREADY_REVERSED")
    }

    @Test
    fun lostResponsesReconcileHistoricalEntriesAfterLaterWritesAndCancellation() {
        val stable = key()
        val original = pay(1000, 0, stable)
        pay(2000)
        inventory.cancel(booking, version(), key())
        assertThat(pay(1000, 0, stable)).isEqualTo(original)
        assertThat(operations.find(OperationKind.RECORD_PAYMENT, stable)).isEqualTo(original)
        assertThat(ledger.summary(booking).reservation.phase).isEqualTo(StayPhase.CANCELLED)
        assertThat(ledger.summary(booking).totals.receivedCents).isEqualTo(3000)
        assertThat(ledger.summary(booking).agreedCents).isEqualTo(10002)
        assertThat(ledger.summary(booking).accommodationCents).isZero()
        assertThat(ledger.summary(booking).outstandingCents).isZero()
        assertThat(ledger.summary(booking).creditCents).isEqualTo(3000)
        assertThat(assertThrows<DomainException> { pay(1001, 0, stable) }.code)
            .isEqualTo("IDEMPOTENCY_KEY_REUSED")
        assertThat(ledger.history(booking, "0", 100).items).hasSize(2)
    }

    @Test
    fun aRepriceMakesAnOlderFinancialConfirmationStale() {
        val quote = quotes.create(room.id!!, "2030-01-01", "2030-01-04", 2)
        inventory.change(booking, quote.startDate, quote.endDate, 2, 0, key(), quote.id)
        assertThat(assertThrows<DomainException> { pay(1000, 0) }.code).isEqualTo("STALE_VERSION")
        assertThat(ledger.summary(booking).agreedCents).isEqualTo(15003)
        assertThat(ledger.history(booking, "0", 100).items).isEmpty()
    }

    @Test
    fun twoOwnersCannotApplyConcurrentRefundsAgainstOneReviewedBalance() {
        val payment = pay(10000).ledgerEntry!!
        val expected = version()
        val pool = Executors.newFixedThreadPool(2)
        val gate = CyclicBarrier(2)
        try {
            val futures =
                (0..1).map { owner ->
                    pool.submit<String> {
                        SecurityContextHolder.getContext().authentication =
                            TestData.authentication(TestData.ownerIdentity(owner))
                        try {
                            gate.await(10, TimeUnit.SECONDS)
                            refund(payment.id, 7000, expected)
                            "SAVED"
                        } catch (error: DomainException) {
                            error.code
                        } finally {
                            SecurityContextHolder.clearContext()
                        }
                    }
                }
            assertThat(futures.map { it.get(15, TimeUnit.SECONDS) })
                .containsExactlyInAnyOrder("SAVED", "STALE_VERSION")
            assertThat(ledger.summary(booking).totals.receivedCents).isEqualTo(3000)
            assertThat(assertThrows<DomainException> { refund(payment.id, 3001) }.code)
                .isEqualTo("REFUND_EXCEEDS_RECEIVED")
        } finally {
            pool.shutdownNow()
        }
    }

    @Test
    fun samePaymentKeyAcrossConcurrentCallsCreatesExactlyOneReceipt() {
        val pool = Executors.newFixedThreadPool(2)
        val gate = CyclicBarrier(2)
        val stable = key()
        try {
            val futures =
                (0..1).map {
                    pool.submit<OperationResult> {
                        SecurityContextHolder.getContext().authentication =
                            TestData.authentication(TestData.ownerIdentity())
                        try {
                            gate.await(10, TimeUnit.SECONDS)
                            pay(2501, 0, stable)
                        } finally {
                            SecurityContextHolder.clearContext()
                        }
                    }
                }
            val results = futures.map { it.get(15, TimeUnit.SECONDS) }
            assertThat(results[0]).isEqualTo(results[1])
            assertThat(ledger.history(booking, "0", 100).items).hasSize(1)
        } finally {
            pool.shutdownNow()
        }
    }

    @Test
    fun allLedgerWritesRollBackWithAuditAndOperationWhenAuditFails() {
        val receipt = pay(5000).ledgerEntry!!
        for (action in
            listOf<(String) -> Unit>(
                { stable -> pay(1000, version(), stable) },
                { stable -> refund(receipt.id, 1000, version(), stable) },
                { stable ->
                    ledger.reverse(
                        booking,
                        ledger.history(booking, "0", 1).items.single().id,
                        "Synthetic correction",
                        version(),
                        stable,
                    )
                },
            )) {
            val expected = version()
            val count = ledger.history(booking, "0", 100).items.size
            val stable = key()
            jdbc.execute(
                "CREATE OR REPLACE FUNCTION synthetic_ledger_failure_fn() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RAISE EXCEPTION 'Synthetic ledger failure' USING ERRCODE='45000'; END \$\$; CREATE TRIGGER synthetic_ledger_failure BEFORE INSERT ON business_events FOR EACH ROW EXECUTE FUNCTION synthetic_ledger_failure_fn()"
            )
            try {
                assertThrows<RuntimeException> { action(stable) }
            } finally {
                jdbc.execute("DROP TRIGGER synthetic_ledger_failure ON business_events")
            }
            assertThat(version()).isEqualTo(expected)
            assertThat(ledger.history(booking, "0", 100).items).hasSize(count)
            assertThat(
                    jdbc.queryForObject(
                        "SELECT COUNT(*) FROM inventory_operations WHERE operation_key=?",
                        Long::class.java,
                        stable,
                    )
                )
                .isZero()
            action(stable)
        }
    }

    @Test
    fun historiesAreBoundedAndIdsRemainStringsBeyondJavascriptPrecision() {
        jdbc.execute("ALTER TABLE ledger_entries ALTER COLUMN id RESTART WITH 9007199254741000")
        val a = pay(100).ledgerEntry!!
        val b = pay(200).ledgerEntry!!
        assertThat(a.id.toLong()).isGreaterThan(EuroCents.MAX)
        val first = ledger.history(booking, "0", 1)
        assertThat(first.items.single()).isEqualTo(b)
        assertThat(ledger.history(booking, first.nextCursor!!, 1).items.single()).isEqualTo(a)
        assertThat(ledger.summary(booking).totals.receivedCents).isEqualTo(300)
        assertThat(ledger.refundable(booking, "0", 1).nextCursor).isEqualTo(b.id)
        assertThrows<DomainException> { ledger.history(booking, "-1", 50) }
        assertThrows<DomainException> { ledger.history(booking, "0", 101) }
        assertThrows<DomainException> { ledger.history(booking, "0", 0) }
    }

    @Test
    fun amountsDatesAndCurrencyAreExactAndNeverCreatePendingFunds() {
        for (amount in listOf(0L, -1L, EuroCents.MAX + 1)) assertThrows<DomainException> {
            pay(amount)
        }
        assertThrows<DomainException> {
            ledger.payment(booking, 1, "CASH", time.today().plusDays(1).toString(), 0, key())
        }
        for (date in listOf("2026-02-30", "0999-12-31", "2026-2-01")) assertThrows<
            DomainException
        > {
            ledger.payment(booking, 1, "CASH", date, 0, key())
        }
        assertThrows<DomainException> { ledger.payment(booking, 1, "cash", today(), 0, key()) }
        assertThrows<DomainException> {
            ledger.payment(booking, 1, "CASH", today(), 0, key(), "USD")
        }
        val original = pay(EuroCents.MAX).ledgerEntry!!
        assertThrows<DomainException> { pay(1) }
        assertThat(ledger.summary(booking).totals.receivedCents).isEqualTo(EuroCents.MAX)
        assertThrows<DomainException> {
            ledger.refund(
                booking,
                original.id,
                1,
                "CASH",
                "1000-01-01",
                "Synthetic",
                version(),
                key(),
            )
        }
        assertThrows<DomainException> {
            ledger.reverse(booking, original.id, " ", version(), key())
        }
        assertThrows<DomainException> {
            ledger.reverse(booking, original.id, "Synthetic\ncontrol", version(), key())
        }
    }

    @Test
    fun foreignBookingAndReceiptLinksNeverCrossPropertyOrReservation() {
        val receipt = pay(100).ledgerEntry!!
        val other =
            reservations.saveAndFlush(
                Reservation(
                    customerId = guest,
                    roomId = room.id,
                    startDate = LocalDate.parse("2031-01-01"),
                    endDate = LocalDate.parse("2031-01-02"),
                    acceptedQuoteId = reservations.findById(booking).orElseThrow().acceptedQuoteId,
                )
            )
        assertThat(
                assertThrows<DomainException> {
                        ledger.refund(
                            other.id!!,
                            receipt.id,
                            1,
                            "CASH",
                            today(),
                            "Synthetic",
                            0,
                            key(),
                        )
                    }
                    .code
            )
            .isEqualTo("NOT_FOUND")
        assertThrows<DomainException> { ledger.summary(Int.MAX_VALUE) }
        assertThrows<DomainException> {
            ledger.payment(Int.MAX_VALUE, 1, "CASH", today(), 0, key())
        }
        assertThrows<DomainException> {
            ledger.reverse(booking, "9223372036854775808", "Synthetic", version(), key())
        }
        val unpriced = reservations.saveAndFlush(other.copy(id = null, acceptedQuoteId = null))
        assertThat(ledger.summary(unpriced.id!!).agreedCents).isNull()
        assertThat(
                assertThrows<DomainException> {
                        ledger.payment(unpriced.id!!, 1, "CASH", today(), 0, key())
                    }
                    .code
            )
            .isEqualTo("AGREED_PRICE_REQUIRED")
    }

    @Test
    fun aVersionAtTheExactSupportedLimitCannotWrapDuringFinancialConfirmation() {
        jdbc.update("UPDATE reservations SET version=? WHERE id=?", EuroCents.MAX, booking)
        assertThat(assertThrows<DomainException> { pay(1, EuroCents.MAX) }.code)
            .isEqualTo("VERSION_LIMIT")
        assertThat(ledger.history(booking, "0", 100).items).isEmpty()
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
