package com.villarosa.service

import com.villarosa.exception.conflict
import com.villarosa.exception.invalid
import com.villarosa.exception.missing
import com.villarosa.repository.LedgerRepository
import com.villarosa.repository.ReservationRepository
import com.villarosa.repository.model.*
import com.villarosa.security.BusinessAudit
import com.villarosa.security.CurrentStaff
import com.villarosa.security.StaffAccess
import java.time.LocalDate
import java.time.format.DateTimeParseException
import org.springframework.data.domain.PageRequest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional

object LedgerInput {
    fun id(value: String): Long =
        value.takeIf { it.matches(Regex("[1-9][0-9]*")) }?.toLongOrNull()
            ?: invalid("INVALID_ENTRY", "Use a positive ledger entry ID.")

    fun cursor(value: String): Long = if (value == "0") 0 else id(value)

    fun date(value: String): LocalDate {
        if (!value.matches(Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}")))
            invalid("INVALID_DATE", "Use a valid date in yyyy-MM-dd format.")
        val result =
            try {
                LocalDate.parse(value)
            } catch (_: DateTimeParseException) {
                invalid("INVALID_DATE", "Use a valid date in yyyy-MM-dd format.")
            }
        if (result.year < 1000) invalid("INVALID_DATE", "Use a date from year 1000 onwards.")
        return result
    }

    fun method(value: String): PaymentMethod =
        PaymentMethod.entries.find { it.name == value }
            ?: invalid(
                "INVALID_METHOD",
                "Choose cash, an external card payment or a bank transfer.",
            )

    fun reference(value: String?): String? {
        val result = value?.trim()?.takeIf(String::isNotEmpty) ?: return null
        if (result.length > 100 || result.any { it.isISOControl() })
            invalid("INVALID_REFERENCE", "Use a receipt reference of at most 100 characters.")
        return result
    }
}

@Service
class LedgerService(
    private val entries: LedgerRepository,
    private val reservations: ReservationRepository,
    private val quotes: QuoteService,
    private val operations: OperationCoordinator,
    private val current: CurrentStaff,
    private val access: StaffAccess,
    private val time: PropertyTime,
    private val jdbc: JdbcTemplate,
    private val audit: BusinessAudit,
) {
    @Transactional(
        readOnly = true,
        propagation = Propagation.REQUIRES_NEW,
        isolation = Isolation.REPEATABLE_READ,
    )
    fun summary(id: Int): LedgerSummary {
        val booking = read(id)
        val agreed = quotes.currentPrice(id)?.quote?.price?.totalCents
        val charge = agreed?.let {
            if (booking.phase in setOf(StayPhase.CANCELLED, StayPhase.NO_SHOW)) 0L else it
        }
        val funds = totals(id)
        return LedgerSummary(
            booking.toReservationInfo(),
            time.today().toString(),
            agreedCents = agreed,
            accommodationCents = charge,
            outstandingCents = charge?.let { maxOf(0L, it - funds.receivedCents) },
            creditCents = charge?.let { maxOf(0L, funds.receivedCents - it) },
            totals = funds,
        )
    }

    @Transactional(
        readOnly = true,
        propagation = Propagation.REQUIRES_NEW,
        isolation = Isolation.REPEATABLE_READ,
    )
    fun history(id: Int, before: String, limit: Int): LedgerHistory {
        read(id)
        pageSize(limit)
        val rows =
            entries.history(
                PropertyScope.ID,
                id,
                LedgerInput.cursor(before),
                PageRequest.of(0, limit + 1),
            )
        val page = rows.take(limit).map { it.info() }
        return LedgerHistory(page, if (rows.size > limit) page.last().id else null)
    }

    @Transactional(
        readOnly = true,
        propagation = Propagation.REQUIRES_NEW,
        isolation = Isolation.REPEATABLE_READ,
    )
    fun refundable(id: Int, before: String, limit: Int): RefundablePayments {
        read(id)
        pageSize(limit)
        val rows =
            entries.payments(
                PropertyScope.ID,
                id,
                LedgerInput.cursor(before),
                PageRequest.of(0, limit + 1),
            )
        val page =
            rows.take(limit).map {
                RefundablePayment(it.info(), it.amountCents - allocated(id, it.id!!))
            }
        return RefundablePayments(page, if (rows.size > limit) page.last().entry.id else null)
    }

    fun payment(
        id: Int,
        amount: Long,
        method: String,
        date: String,
        expected: Long,
        key: String,
        currency: String = "EUR",
        reference: String? = null,
    ): OperationResult {
        EuroCents.currency(currency)
        EuroCents.positive(amount)
        val channel = LedgerInput.method(method)
        val effective = effective(date)
        val receipt = LedgerInput.reference(reference)
        return operations.execute(
            OperationKind.RECORD_PAYMENT,
            key,
            listOf(id, amount, channel, effective, expected, currency, receipt),
        ) { stable ->
            val booking = locked(id, expected)
            EuroCents.add(totals(id).paymentsCents, amount)
            append(
                booking,
                stable,
                LedgerKind.PAYMENT,
                amount,
                effective,
                channel,
                reference = receipt,
            )
        }
    }

    fun refund(
        id: Int,
        suppliedPayment: String,
        amount: Long,
        method: String,
        date: String,
        reason: String?,
        expected: Long,
        key: String,
        currency: String = "EUR",
        reference: String? = null,
    ): OperationResult {
        EuroCents.currency(currency)
        EuroCents.positive(amount)
        val paymentId = LedgerInput.id(suppliedPayment)
        val channel = LedgerInput.method(method)
        val effective = effective(date)
        val explanation = OperationReason.required(reason)
        val receipt = LedgerInput.reference(reference)
        return operations.execute(
            OperationKind.RECORD_REFUND,
            key,
            listOf(
                id,
                paymentId,
                amount,
                channel,
                effective,
                explanation,
                expected,
                currency,
                receipt,
            ),
        ) { stable ->
            val booking = locked(id, expected)
            val payment = entry(id, paymentId)
            if (payment.kind != LedgerKind.PAYMENT || reversed(paymentId))
                conflict("PAYMENT_UNAVAILABLE", "Choose an unreversed payment for this refund.")
            if (effective < payment.effectiveDate)
                invalid("INVALID_DATE", "A refund cannot precede its payment date.")
            if (amount > payment.amountCents - allocated(id, paymentId))
                conflict(
                    "REFUND_EXCEEDS_RECEIVED",
                    "The refund exceeds the money remaining on this payment.",
                )
            EuroCents.add(totals(id).refundsCents, amount)
            append(
                booking,
                stable,
                LedgerKind.REFUND,
                amount,
                effective,
                channel,
                paymentId,
                reason = explanation,
                reference = receipt,
            )
        }
    }

    fun reverse(
        id: Int,
        suppliedEntry: String,
        reason: String?,
        expected: Long,
        key: String,
    ): OperationResult {
        val entryId = LedgerInput.id(suppliedEntry)
        val explanation = OperationReason.required(reason)
        return operations.execute(
            OperationKind.REVERSE_ENTRY,
            key,
            listOf(id, entryId, explanation, expected),
        ) { stable ->
            val booking = locked(id, expected)
            val original = entry(id, entryId)
            if (original.kind == LedgerKind.REVERSAL || reversed(entryId))
                conflict(
                    "ENTRY_ALREADY_REVERSED",
                    "Only an unreversed payment or refund can be corrected.",
                )
            if (original.kind == LedgerKind.PAYMENT && allocated(id, entryId) != 0L)
                conflict(
                    "PAYMENT_HAS_REFUNDS",
                    "Correct linked refunds before reversing their payment.",
                )
            if (original.kind == LedgerKind.REFUND)
                EuroCents.add(totals(id).receivedCents, original.amountCents)
            append(
                booking,
                stable,
                LedgerKind.REVERSAL,
                original.amountCents,
                time.today(),
                reversesId = entryId,
                reason = explanation,
            )
        }
    }

    private fun read(id: Int): Reservation {
        access.current(current.identity())
        return reservations.findByPropertyIdAndId(PropertyScope.ID, id)
            ?: missing("Reservation does not exist.")
    }

    private fun locked(id: Int, expected: Long): Reservation {
        val booking =
            reservations.locked(PropertyScope.ID, id) ?: missing("Reservation does not exist.")
        ReadinessService.checkVersion(booking.version, expected)
        if (booking.acceptedQuoteId == null)
            conflict(
                "AGREED_PRICE_REQUIRED",
                "This historical booking has no agreed EUR price. No payment was recorded.",
            )
        if (booking.version >= EuroCents.MAX)
            conflict("VERSION_LIMIT", "This record has reached its supported version limit.")
        return booking
    }

    private fun entry(id: Int, entry: Long): LedgerEntry =
        entries.findByPropertyIdAndReservationIdAndId(PropertyScope.ID, id, entry)
            ?: missing("Ledger entry does not exist for this reservation.")

    private fun reversed(id: Long) = entries.existsByPropertyIdAndReversesId(PropertyScope.ID, id)

    private fun effective(value: String): LocalDate =
        LedgerInput.date(value).also {
            if (it > time.today())
                invalid("FUTURE_PAYMENT", "Record only money already received or refunded.")
        }

    private fun pageSize(limit: Int) {
        if (limit !in 1..100) invalid("INVALID_PAGE_SIZE", "Ledger pages contain 1 to 100 entries.")
    }

    private fun totals(id: Int): LedgerTotals {
        val values =
            jdbc
                .query(
                    "SELECT e.kind, SUM(e.amount_cents) AS total FROM ledger_entries e WHERE e.property_id=? AND e.reservation_id=? AND e.kind IN ('PAYMENT','REFUND') AND NOT EXISTS (SELECT 1 FROM ledger_entries r WHERE r.property_id=e.property_id AND r.reverses_id=e.id) GROUP BY e.kind",
                    { row, _ -> row.getString(1) to exact(row.getBigDecimal(2)) },
                    PropertyScope.ID,
                    id,
                )
                .toMap()
        val payments = values["PAYMENT"] ?: 0
        val refunds = values["REFUND"] ?: 0
        check(refunds <= payments) { "Ledger refunds exceed effective payments." }
        return LedgerTotals(payments, refunds, payments - refunds)
    }

    private fun allocated(id: Int, payment: Long): Long =
        jdbc
            .queryForObject(
                "SELECT COALESCE(SUM(e.amount_cents),0) FROM ledger_entries e WHERE e.property_id=? AND e.reservation_id=? AND e.kind='REFUND' AND e.payment_id=? AND NOT EXISTS (SELECT 1 FROM ledger_entries r WHERE r.property_id=e.property_id AND r.reverses_id=e.id)",
                java.math.BigDecimal::class.java,
                PropertyScope.ID,
                id,
                payment,
            )!!
            .let(::exact)

    private fun exact(value: java.math.BigDecimal): Long {
        val result =
            try {
                value.longValueExact()
            } catch (_: ArithmeticException) {
                conflict("AMOUNT_TOO_LARGE", "The ledger total exceeds supported exact EUR cents.")
            }
        if (result !in 0..EuroCents.MAX)
            conflict("AMOUNT_TOO_LARGE", "The ledger total exceeds supported exact EUR cents.")
        return result
    }

    private fun append(
        booking: Reservation,
        key: String,
        kind: LedgerKind,
        amount: Long,
        date: LocalDate,
        method: PaymentMethod? = null,
        paymentId: Long? = null,
        reversesId: Long? = null,
        reason: String? = null,
        reference: String? = null,
    ): OperationResult {
        booking.financeRevision = EuroCents.add(booking.financeRevision, 1)
        reservations.saveAndFlush(booking)
        val saved =
            entries.saveAndFlush(
                LedgerEntry(
                    reservationId = booking.id!!,
                    reservationVersion = booking.version,
                    actorId = current.identity().id,
                    operationKey = key,
                    kind = kind,
                    amountCents = amount,
                    method = method,
                    paymentId = paymentId,
                    reversesId = reversesId,
                    reason = reason,
                    reference = reference,
                    effectiveDate = date,
                    recordedAt = time.now(),
                )
            )
        audit.record(
            current.identity().id,
            "LEDGER_${kind.name}",
            "RESERVATION",
            booking.id!!.toString(),
        )
        val operation =
            when (kind) {
                LedgerKind.PAYMENT -> OperationKind.RECORD_PAYMENT
                LedgerKind.REFUND -> OperationKind.RECORD_REFUND
                LedgerKind.REVERSAL -> OperationKind.REVERSE_ENTRY
            }
        return OperationResult(
            key,
            operation,
            booking.id!!,
            reservation = booking.toReservationInfo(),
            ledgerEntry = saved.info(),
        )
    }
}
