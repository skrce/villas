package com.villarosa.repository.model

import com.villarosa.service.PropertyScope
import jakarta.persistence.*
import java.time.Instant
import java.time.LocalDate
import org.hibernate.annotations.Immutable
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.type.SqlTypes

enum class LedgerKind {
    PAYMENT,
    REFUND,
    REVERSAL,
}

enum class PaymentMethod {
    CASH,
    CARD,
    BANK_TRANSFER,
}

@Entity
@Immutable
@Table(name = "ledger_entries")
class LedgerEntry(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) val id: Long? = null,
    @Column(name = "property_id", nullable = false, length = 64)
    val propertyId: String = PropertyScope.ID,
    @Column(name = "reservation_id", nullable = false) val reservationId: Int = 0,
    @Column(name = "reservation_version", nullable = false) val reservationVersion: Long = 0,
    @Column(name = "actor_id", nullable = false, length = 36) val actorId: String = "",
    @Column(name = "operation_key", nullable = false, length = 36) val operationKey: String = "",
    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(nullable = false, length = 16)
    val kind: LedgerKind = LedgerKind.PAYMENT,
    @Column(nullable = false, length = 3) val currency: String = "EUR",
    @Column(name = "amount_cents", nullable = false) val amountCents: Long = 0,
    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(length = 16)
    val method: PaymentMethod? = null,
    @Column(name = "payment_id") val paymentId: Long? = null,
    @Column(name = "reverses_id") val reversesId: Long? = null,
    @Column(length = 500) val reason: String? = null,
    @Column(length = 100) val reference: String? = null,
    @Column(name = "effective_date", nullable = false) val effectiveDate: LocalDate = LocalDate.MIN,
    @Column(name = "recorded_at", nullable = false) val recordedAt: Instant = Instant.EPOCH,
) {
    fun info() =
        LedgerEntryInfo(
            id.toString(),
            reservationId,
            reservationVersion,
            actorId,
            operationKey,
            kind,
            currency,
            amountCents,
            method,
            paymentId?.toString(),
            reversesId?.toString(),
            reason,
            reference,
            effectiveDate.toString(),
            recordedAt.toString(),
        )
}

data class LedgerEntryInfo(
    val id: String,
    val reservationId: Int,
    val reservationVersion: Long,
    val actorId: String,
    val operationKey: String,
    val kind: LedgerKind,
    val currency: String,
    val amountCents: Long,
    val method: PaymentMethod?,
    val paymentId: String?,
    val reversesId: String?,
    val reason: String?,
    val reference: String?,
    val effectiveDate: String,
    val recordedAt: String,
)

data class LedgerTotals(val paymentsCents: Long, val refundsCents: Long, val receivedCents: Long)

data class LedgerSummary(
    val reservation: ReservationInfo,
    val propertyDate: String,
    val currency: String = "EUR",
    val agreedCents: Long?,
    val accommodationCents: Long?,
    val outstandingCents: Long?,
    val creditCents: Long?,
    val totals: LedgerTotals,
)

data class LedgerHistory(val items: List<LedgerEntryInfo>, val nextCursor: String?)

data class RefundablePayment(val entry: LedgerEntryInfo, val refundableCents: Long)

data class RefundablePayments(val items: List<RefundablePayment>, val nextCursor: String?)
