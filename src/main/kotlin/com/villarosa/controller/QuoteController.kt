package com.villarosa.controller

import com.fasterxml.jackson.annotation.JsonAnySetter
import com.villarosa.exception.invalid
import com.villarosa.service.*
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import jakarta.validation.constraints.*
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

data class ReservationPriceView(val recorded: Boolean, val price: AcceptedPrice?)

data class QuoteRequest(
    @field:NotNull
    @field:Min(1)
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED)
    val roomId: Int?,
    @field:NotBlank val startDate: String,
    @field:NotBlank val endDate: String,
    @field:Min(1) val guestCount: Int = 1,
    val currency: String = "EUR",
) {
    @JsonAnySetter
    fun unknown(name: String, value: Any?) {
        invalid(
            "INVALID_QUOTE",
            "Only room, dates, party size and EUR currency are accepted for a quote.",
        )
    }
}

data class QuoteConfirmationRequest(
    @field:NotNull
    @field:Min(1)
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED)
    val customerId: Int?,
    @field:NotBlank val quoteId: String,
    @field:NotNull
    @field:Min(1)
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED)
    val roomId: Int?,
    @field:NotBlank val startDate: String,
    @field:NotBlank val endDate: String,
    @field:NotNull
    @field:Min(1)
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED)
    val guestCount: Int?,
) {
    @JsonAnySetter
    fun unknown(name: String, value: Any?) {
        invalid(
            "INVALID_QUOTE",
            "Confirmation accepts only the guest, saved quote and reviewed stay details.",
        )
    }
}

data class QuotedRoomChange(
    @field:NotNull
    @field:Min(1)
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED)
    val newRoomId: Int?,
    @field:NotNull
    @field:Min(0)
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED)
    val expectedVersion: Long?,
    @field:NotBlank val quoteId: String,
) {
    @JsonAnySetter
    fun unknown(name: String, value: Any?) {
        invalid(
            "INVALID_QUOTE",
            "A room change accepts only the destination, reviewed version and quote.",
        )
    }
}

data class QuotedStayChange(
    @field:NotBlank val startDate: String,
    @field:NotBlank val endDate: String,
    @field:NotNull
    @field:Min(1)
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED)
    val guestCount: Int?,
    @field:NotNull
    @field:Min(0)
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED)
    val expectedVersion: Long?,
    @field:NotBlank val quoteId: String,
) {
    @JsonAnySetter
    fun unknown(name: String, value: Any?) {
        invalid(
            "INVALID_QUOTE",
            "A stay change accepts only dates, party size, reviewed version and quote.",
        )
    }
}

@RestController
@Tag(name = "Quotes")
class QuoteController(
    private val quotes: QuoteService,
    private val reservations: ReservationService,
) {
    @PostMapping("/api/v1/booking-quotes")
    @Operation(
        operationId = "createBookingQuote",
        summary = "Save an Owner-scoped EUR accommodation quote without holding inventory",
    )
    fun create(@Valid @RequestBody body: QuoteRequest): BookingQuote =
        quotes.create(body.roomId!!, body.startDate, body.endDate, body.guestCount, body.currency)

    @GetMapping("/api/v1/booking-quotes/{quoteId}")
    @Operation(
        operationId = "getBookingQuote",
        summary = "Read this Owner's saved historical quote",
    )
    fun get(@PathVariable quoteId: String): BookingQuote = quotes.get(quoteId)

    @PostMapping("/api/v1/reservations/quoted")
    @Operation(
        operationId = "confirmReservationQuote",
        summary =
            "Accept a saved quote and atomically create its priced reservation with a stable operation key",
    )
    fun confirm(
        @Valid @RequestBody body: QuoteConfirmationRequest,
        @RequestHeader("Idempotency-Key") key: String,
    ): ResponseEntity<Int> {
        val saved =
            reservations.createQuoted(
                body.customerId!!,
                body.quoteId,
                body.roomId!!,
                body.startDate,
                body.endDate,
                body.guestCount!!,
                key,
            )
        return ResponseEntity.ok()
            .header("X-Operation-Key", saved.key)
            .header("X-Resource-Version", saved.reservation!!.version.toString())
            .body(saved.resourceId)
    }

    @GetMapping("/api/v1/reservations/{reservationId}/price")
    @Operation(
        operationId = "reservationPrice",
        summary = "Read the accepted price or explicit unrecorded historical state",
    )
    fun price(@PathVariable reservationId: Int): ReservationPriceView =
        quotes.currentPrice(reservationId).let { ReservationPriceView(it != null, it) }

    @PatchMapping("/api/v1/reservations/{reservationId}/room/quoted")
    @Operation(
        operationId = "moveReservationWithQuote",
        summary = "Accept a new whole-stay price and move the reservation atomically",
    )
    fun move(
        @PathVariable reservationId: Int,
        @Valid @RequestBody body: QuotedRoomChange,
        @RequestHeader("Idempotency-Key") key: String,
    ) =
        reservations
            .move(reservationId, body.newRoomId!!, body.expectedVersion!!, key, body.quoteId)
            .reservation!!

    @PatchMapping("/api/v1/reservations/{reservationId}/dates/quoted")
    @Operation(
        operationId = "changeReservationWithQuote",
        summary = "Accept a new whole-stay price and change dates or party size atomically",
    )
    fun change(
        @PathVariable reservationId: Int,
        @Valid @RequestBody body: QuotedStayChange,
        @RequestHeader("Idempotency-Key") key: String,
    ) =
        reservations
            .change(
                reservationId,
                body.startDate,
                body.endDate,
                body.guestCount!!,
                body.expectedVersion!!,
                key,
                body.quoteId,
            )
            .reservation!!

    @GetMapping("/api/v1/reservations/{reservationId}/prices")
    @Operation(
        operationId = "reservationPriceHistory",
        summary = "Read bounded immutable accepted price history",
    )
    fun history(
        @PathVariable reservationId: Int,
        @RequestParam(required = false) beforeVersion: Long?,
        @RequestParam(defaultValue = "20") limit: Int,
    ): PriceHistory = quotes.history(reservationId, beforeVersion, limit)
}
