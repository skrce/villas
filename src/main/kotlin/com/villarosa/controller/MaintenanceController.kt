package com.villarosa.controller

import com.villarosa.repository.model.MaintenanceInfo
import com.villarosa.service.ReservationService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.web.bind.annotation.*

@Tag(name = "Maintenance")
@RestController
class MaintenanceController(private val service: ReservationService) {
    @PostMapping("/api/v1/maintenance-blocks")
    @Operation(
        operationId = "createMaintenanceBlock",
        summary = "Block a room only if no active inventory overlaps",
    )
    fun create(
        @RequestParam roomId: Int,
        @RequestParam startDate: String,
        @RequestParam endDate: String,
        @RequestParam(defaultValue = "Maintenance") reason: String,
        @RequestHeader("Idempotency-Key") key: String,
    ): MaintenanceInfo = service.block(roomId, startDate, endDate, reason, key).maintenance!!

    @DeleteMapping("/api/v1/maintenance-blocks/{blockId}")
    @Operation(
        operationId = "cancelMaintenanceBlock",
        summary = "Retain a block cancellation and release inventory",
    )
    fun cancel(
        @PathVariable blockId: Int,
        @RequestParam expectedVersion: Long,
        @RequestHeader("Idempotency-Key") key: String,
    ): MaintenanceInfo = service.unblock(blockId, expectedVersion, key).maintenance!!
}
