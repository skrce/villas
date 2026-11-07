package com.villarosa.controller

import com.villarosa.security.CurrentStaff
import com.villarosa.security.StaffAccess
import com.villarosa.service.*
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import jakarta.validation.constraints.*
import org.springframework.web.bind.annotation.*

data class CheckInRequest(
    @field:NotNull @field:Min(0) @field:Max(EuroCents.MAX) val expectedVersion: Long?,
    @field:NotNull @field:Min(0) @field:Max(EuroCents.MAX) val readinessVersion: Long?,
)

data class CheckOutRequest(
    @field:NotNull @field:Min(0) @field:Max(EuroCents.MAX) val expectedVersion: Long?,
    @field:NotNull val acknowledgeBalance: Boolean?,
    @field:Size(max = 500) val reason: String? = null,
)

data class StayReasonRequest(
    @field:NotNull @field:Min(0) @field:Max(EuroCents.MAX) val expectedVersion: Long?,
    @field:NotBlank @field:Size(max = 500) val reason: String,
)

data class OperationalMoveRequest(
    @field:NotNull @field:Min(1) val roomId: Int?,
    @field:NotNull @field:Min(0) @field:Max(EuroCents.MAX) val expectedVersion: Long?,
    val quoteId: String? = null,
    @field:Min(0) @field:Max(EuroCents.MAX) val readinessVersion: Long? = null,
    @field:NotBlank @field:Size(max = 500) val reason: String,
)

data class OperationalChangeRequest(
    @field:NotBlank val startDate: String,
    @field:NotBlank val endDate: String,
    @field:NotNull @field:Min(1) val guestCount: Int?,
    @field:NotNull @field:Min(0) @field:Max(EuroCents.MAX) val expectedVersion: Long?,
    val quoteId: String? = null,
    @field:NotBlank @field:Size(max = 500) val reason: String,
)

data class ActualTimesRequest(
    @field:NotNull @field:Min(0) @field:Max(EuroCents.MAX) val expectedVersion: Long?,
    @field:NotBlank val checkedInAt: String,
    val checkedOutAt: String? = null,
    @field:NotBlank @field:Size(max = 500) val reason: String,
)

data class PropertyTimeRequest(@field:NotBlank val localDateTime: String)

data class PropertyTimeOption(val utc: String, val offset: String)

data class PropertyTimeOptions(
    val localDateTime: String,
    val timezone: String,
    val options: List<PropertyTimeOption>,
)

@RestController
@Tag(name = "Operations")
class StayOperationsController(
    private val stays: StayOperations,
    private val current: CurrentStaff,
    private val access: StaffAccess,
) {
    @PostMapping("/api/v1/reservations/{id}/check-in")
    @Operation(
        operationId = "checkInStay",
        summary = "Record arrival within the booked dates into a reviewed clean room",
    )
    fun checkIn(
        @PathVariable id: Int,
        @RequestBody @Valid body: CheckInRequest,
        @RequestHeader("Idempotency-Key") key: String,
    ) = stays.checkIn(id, body.expectedVersion!!, body.readinessVersion!!, key)

    @PostMapping("/api/v1/reservations/{id}/check-out")
    @Operation(
        operationId = "checkOutStay",
        summary = "Record departure and mark its room dirty in one transaction",
    )
    fun checkOut(
        @PathVariable id: Int,
        @RequestBody @Valid body: CheckOutRequest,
        @RequestHeader("Idempotency-Key") key: String,
    ) = stays.checkOut(id, body.expectedVersion!!, body.acknowledgeBalance!!, body.reason, key)

    @PostMapping("/api/v1/reservations/{id}/no-show")
    @Operation(
        operationId = "recordNoShow",
        summary = "Record a reasoned no-show after the arrival day",
    )
    fun noShow(
        @PathVariable id: Int,
        @RequestBody @Valid body: StayReasonRequest,
        @RequestHeader("Idempotency-Key") key: String,
    ) = stays.noShow(id, body.expectedVersion!!, body.reason, key)

    @PostMapping("/api/v1/reservations/{id}/cancel")
    @Operation(
        operationId = "cancelStay",
        summary = "Record a reasoned cancellation without an automatic refund",
    )
    fun cancel(
        @PathVariable id: Int,
        @RequestBody @Valid body: StayReasonRequest,
        @RequestHeader("Idempotency-Key") key: String,
    ) = stays.cancel(id, body.expectedVersion!!, body.reason, key)

    @PostMapping("/api/v1/reservations/{id}/move")
    @Operation(
        operationId = "moveStay",
        summary = "Accept a new whole-stay quote and move a confirmed or in-house stay",
    )
    fun move(
        @PathVariable id: Int,
        @RequestBody @Valid body: OperationalMoveRequest,
        @RequestHeader("Idempotency-Key") key: String,
    ) =
        stays.move(
            id,
            body.roomId!!,
            body.expectedVersion!!,
            body.quoteId,
            body.readinessVersion,
            body.reason,
            key,
        )

    @PostMapping("/api/v1/reservations/{id}/change")
    @Operation(
        operationId = "changeStay",
        summary = "Accept a new whole-stay quote and change reviewed dates or party size",
    )
    fun change(
        @PathVariable id: Int,
        @RequestBody @Valid body: OperationalChangeRequest,
        @RequestHeader("Idempotency-Key") key: String,
    ) =
        stays.change(
            id,
            body.startDate,
            body.endDate,
            body.guestCount!!,
            body.expectedVersion!!,
            body.quoteId,
            body.reason,
            key,
        )

    @PostMapping("/api/v1/reservations/{id}/actual-times")
    @Operation(
        operationId = "correctStayTimes",
        summary = "Correct actual arrival/departure times with a retained Owner reason",
    )
    fun correct(
        @PathVariable id: Int,
        @RequestBody @Valid body: ActualTimesRequest,
        @RequestHeader("Idempotency-Key") key: String,
    ) =
        stays.correct(
            id,
            body.expectedVersion!!,
            body.checkedInAt,
            body.checkedOutAt,
            body.reason,
            key,
        )

    @PostMapping("/api/v1/property-time/options")
    @Operation(
        operationId = "propertyTimeOptions",
        summary =
            "Resolve a Skopje time to explicit UTC choices, including repeated or missing daylight-saving times",
    )
    fun time(@RequestBody @Valid body: PropertyTimeRequest): PropertyTimeOptions {
        access.current(current.identity())
        val local = OperationTimes.local(body.localDateTime)
        return PropertyTimeOptions(
            body.localDateTime,
            PropertyTime.ZONE.id,
            PropertyTime.ZONE.rules.getValidOffsets(local).map {
                PropertyTimeOption(local.toInstant(it).toString(), it.id)
            },
        )
    }
}
