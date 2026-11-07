package com.villarosa.controller

import com.villarosa.repository.model.ReadinessState
import com.villarosa.service.ReadinessService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import jakarta.validation.constraints.NotNull
import jakarta.validation.constraints.PositiveOrZero
import jakarta.validation.constraints.Size
import org.springframework.web.bind.annotation.*

data class ReadinessChangeRequest(
    @field:NotNull val state: ReadinessState?,
    @field:NotNull @field:PositiveOrZero val expectedVersion: Long?,
    @field:Size(max = 500) val reason: String? = null,
)

@RestController
@Tag(name = "Operations")
class ReadinessController(private val readiness: ReadinessService) {
    @GetMapping("/api/v1/apartments/{roomId}/readiness")
    @Operation(
        operationId = "roomReadiness",
        summary = "Read current room readiness without guest or financial data",
    )
    fun read(@PathVariable roomId: Int) = readiness.read(roomId)

    @PostMapping("/api/v1/apartments/{roomId}/readiness")
    @Operation(
        operationId = "changeRoomReadiness",
        summary = "Record a reviewed room-readiness transition",
    )
    fun change(
        @PathVariable roomId: Int,
        @RequestBody @Valid request: ReadinessChangeRequest,
        @RequestHeader("Idempotency-Key") key: String,
    ) = readiness.change(roomId, request.state!!, request.expectedVersion!!, key, request.reason)

    @GetMapping("/api/v1/apartments/{roomId}/readiness/events")
    @Operation(
        operationId = "roomReadinessHistory",
        summary = "Read bounded room-readiness history",
    )
    fun history(
        @PathVariable roomId: Int,
        @RequestParam(defaultValue = "0") afterId: String,
        @RequestParam(defaultValue = "50") limit: Int,
    ) = readiness.history(roomId, afterId, limit)
}
