package com.villarosa.controller

import com.villarosa.repository.model.*
import com.villarosa.service.InventoryQueries
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.web.bind.annotation.*

@Tag(name = "Inventory")
@RestController
class InventoryQueryController(private val queries: InventoryQueries) {
    @GetMapping("/api/v1/reservations")
    @Operation(
        operationId = "listReservations",
        summary = "Read a bounded overlapping-stay calendar page",
    )
    fun reservations(
        @RequestParam startDate: String,
        @RequestParam endDate: String,
        @RequestParam(required = false) status: ReservationStatus?,
        @RequestParam(defaultValue = "0") afterId: Int,
        @RequestParam(defaultValue = "100") limit: Int,
    ): ReservationPage = queries.reservations(startDate, endDate, status, afterId, limit)

    @GetMapping("/api/v1/maintenance-blocks")
    @Operation(
        operationId = "listMaintenanceBlocks",
        summary = "Read a bounded maintenance calendar page",
    )
    fun maintenance(
        @RequestParam startDate: String,
        @RequestParam endDate: String,
        @RequestParam(required = false) status: ReservationStatus?,
        @RequestParam(defaultValue = "0") afterId: Int,
        @RequestParam(defaultValue = "100") limit: Int,
    ): MaintenancePage = queries.maintenance(startDate, endDate, status, afterId, limit)

    @GetMapping("/api/v1/reservations/{reservationId}/events")
    @Operation(
        operationId = "reservationHistory",
        summary = "Read a bounded reservation event page",
    )
    fun reservationEvents(
        @PathVariable reservationId: Int,
        @RequestParam(defaultValue = "0") afterId: String,
        @RequestParam(defaultValue = "100") limit: Int,
    ): InventoryEventPage = queries.reservationEvents(reservationId, afterId, limit)

    @GetMapping("/api/v1/maintenance-blocks/{blockId}/events")
    @Operation(
        operationId = "maintenanceHistory",
        summary = "Read a bounded maintenance event page",
    )
    fun maintenanceEvents(
        @PathVariable blockId: Int,
        @RequestParam(defaultValue = "0") afterId: String,
        @RequestParam(defaultValue = "100") limit: Int,
    ): InventoryEventPage = queries.maintenanceEvents(blockId, afterId, limit)
}
