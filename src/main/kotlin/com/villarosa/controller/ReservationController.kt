package com.villarosa.controller

import com.villarosa.repository.model.*
import com.villarosa.service.ReservationService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

@Tag(name = "Reservation")
@RestController
class ReservationController(private val service: ReservationService) {
    @PostMapping("/api/v1/reservations")
    @Operation(
        operationId = "createReservation",
        summary = "Create a reservation with an accepted quote and stable operation key",
    )
    fun createReservation(
        @RequestParam customerId: Int,
        @RequestParam roomId: Int,
        @RequestParam startDate: String,
        @RequestParam endDate: String,
        @RequestParam(defaultValue = "1") guestCount: Int,
        @RequestHeader("Idempotency-Key") key: String,
        @RequestParam(required = false) quoteId: String?,
    ): ResponseEntity<Int> {
        val result =
            service.create(customerId, roomId, startDate, endDate, guestCount, key, quoteId)
        return ResponseEntity.ok()
            .header("X-Operation-Key", result.key)
            .header("X-Resource-Version", result.reservation!!.version.toString())
            .body(result.resourceId)
    }

    @PatchMapping("/api/v1/reservations")
    @Operation(
        operationId = "updateReservationRoom",
        summary = "Move a reservation using its expected version",
    )
    fun updateReservationRoom(
        @RequestParam reservationId: Int,
        @RequestParam newRoomId: Int,
        @RequestParam expectedVersion: Long,
        @RequestHeader("Idempotency-Key") key: String,
    ) {
        service.move(reservationId, newRoomId, expectedVersion, key)
    }

    @DeleteMapping("/api/v1/reservations")
    @Operation(
        operationId = "cancelReservation",
        summary = "Retain a cancellation and release inventory",
    )
    fun cancelReservation(
        @RequestParam reservationId: Int,
        @RequestParam expectedVersion: Long,
        @RequestHeader("Idempotency-Key") key: String,
    ) {
        service.cancel(reservationId, expectedVersion, key)
    }

    @PatchMapping("/api/v1/reservations/{reservationId}/dates")
    @Operation(
        operationId = "changeReservationDates",
        summary = "Change stay dates and guest count",
    )
    fun changeDates(
        @PathVariable reservationId: Int,
        @RequestParam startDate: String,
        @RequestParam endDate: String,
        @RequestParam guestCount: Int,
        @RequestParam expectedVersion: Long,
        @RequestHeader("Idempotency-Key") key: String,
    ): ReservationInfo =
        service
            .change(reservationId, startDate, endDate, guestCount, expectedVersion, key)
            .reservation!!

    @GetMapping("/api/v1/reservations/{reservationId}")
    @Operation(
        operationId = "getReservation",
        summary = "Read the current reservation, including its version",
    )
    fun get(@PathVariable reservationId: Int): ReservationInfo = service.reservation(reservationId)

    @GetMapping("/api/v1/reservations/available-apartments")
    @Operation(
        operationId = "findAvailableApartments",
        summary = "Read advisory availability using the write-side overlap rules",
    )
    fun available(
        @RequestParam startDate: String,
        @RequestParam endDate: String,
        @RequestParam(defaultValue = "1") guestCount: Int,
    ): List<Apartment> = service.findAvailableApartments(startDate, endDate, guestCount)

    @GetMapping("/api/v1/reservations/customer")
    @Operation(
        operationId = "findReservationsByCustomer",
        summary = "Read active reservations for a guest",
    )
    fun customer(@RequestParam customerId: Int): List<ReservationInfo> =
        service.findReservationsByCustomer(customerId)

    @GetMapping("/api/v1/operations/{operationKey}")
    @Operation(
        operationId = "getOperation",
        summary = "Reconcile a write using its stable operation key",
    )
    fun operation(
        @PathVariable operationKey: String,
        @RequestParam kind: OperationKind,
    ): OperationResult = service.operation(kind, operationKey)
}
