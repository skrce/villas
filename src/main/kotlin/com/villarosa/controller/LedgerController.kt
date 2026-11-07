package com.villarosa.controller

import com.villarosa.service.EuroCents
import com.villarosa.service.LedgerService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import jakarta.validation.constraints.*
import org.springframework.web.bind.annotation.*

data class PaymentRequest(
    @field:NotNull @field:Min(1) @field:Max(EuroCents.MAX) val amountCents: Long?,
    @field:NotBlank
    @field:Schema(allowableValues = ["CASH", "CARD", "BANK_TRANSFER"])
    val method: String,
    @field:NotBlank val effectiveDate: String,
    @field:NotNull @field:Min(0) @field:Max(EuroCents.MAX) val expectedVersion: Long?,
    val currency: String = "EUR",
    @field:Size(max = 100) val reference: String? = null,
)

data class RefundRequest(
    @field:NotBlank val paymentId: String,
    @field:NotNull @field:Min(1) @field:Max(EuroCents.MAX) val amountCents: Long?,
    @field:NotBlank
    @field:Schema(allowableValues = ["CASH", "CARD", "BANK_TRANSFER"])
    val method: String,
    @field:NotBlank val effectiveDate: String,
    @field:NotBlank @field:Size(max = 500) val reason: String,
    @field:NotNull @field:Min(0) @field:Max(EuroCents.MAX) val expectedVersion: Long?,
    val currency: String = "EUR",
    @field:Size(max = 100) val reference: String? = null,
)

data class ReversalRequest(
    @field:NotBlank @field:Size(max = 500) val reason: String,
    @field:NotNull @field:Min(0) @field:Max(EuroCents.MAX) val expectedVersion: Long?,
)

@RestController
@Tag(name = "Payments")
class LedgerController(private val ledger: LedgerService) {
    @GetMapping("/api/v1/reservations/{id}/ledger")
    @Operation(
        operationId = "reservationLedger",
        summary = "Read agreed accommodation and externally received funds",
    )
    fun summary(@PathVariable id: Int) = ledger.summary(id)

    @GetMapping("/api/v1/reservations/{id}/ledger/entries")
    @Operation(
        operationId = "reservationLedgerHistory",
        summary = "Read immutable payment, refund and correction history",
    )
    fun history(
        @PathVariable id: Int,
        @RequestParam(defaultValue = "0") beforeId: String,
        @RequestParam(defaultValue = "50") limit: Int,
    ) = ledger.history(id, beforeId, limit)

    @GetMapping("/api/v1/reservations/{id}/ledger/payments")
    @Operation(
        operationId = "refundablePayments",
        summary = "Read receipt allocations available for manual refund",
    )
    fun payments(
        @PathVariable id: Int,
        @RequestParam(defaultValue = "0") beforeId: String,
        @RequestParam(defaultValue = "50") limit: Int,
    ) = ledger.refundable(id, beforeId, limit)

    @PostMapping("/api/v1/reservations/{id}/ledger/payments")
    @Operation(
        operationId = "recordPayment",
        summary = "Record a payment already completed outside Villas",
    )
    fun payment(
        @PathVariable id: Int,
        @RequestBody @Valid request: PaymentRequest,
        @RequestHeader("Idempotency-Key") key: String,
    ) =
        ledger.payment(
            id,
            request.amountCents!!,
            request.method,
            request.effectiveDate,
            request.expectedVersion!!,
            key,
            request.currency,
            request.reference,
        )

    @PostMapping("/api/v1/reservations/{id}/ledger/refunds")
    @Operation(
        operationId = "recordRefund",
        summary = "Record an externally completed refund against one receipt",
    )
    fun refund(
        @PathVariable id: Int,
        @RequestBody @Valid request: RefundRequest,
        @RequestHeader("Idempotency-Key") key: String,
    ) =
        ledger.refund(
            id,
            request.paymentId,
            request.amountCents!!,
            request.method,
            request.effectiveDate,
            request.reason,
            request.expectedVersion!!,
            key,
            request.currency,
            request.reference,
        )

    @PostMapping("/api/v1/reservations/{id}/ledger/entries/{entryId}/reversal")
    @Operation(
        operationId = "reverseLedgerEntry",
        summary = "Retain and correct a mistaken payment or refund with a reason",
    )
    fun reverse(
        @PathVariable id: Int,
        @PathVariable entryId: String,
        @RequestBody @Valid request: ReversalRequest,
        @RequestHeader("Idempotency-Key") key: String,
    ) = ledger.reverse(id, entryId, request.reason, request.expectedVersion!!, key)
}
