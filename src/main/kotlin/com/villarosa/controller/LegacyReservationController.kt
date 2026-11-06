package com.villarosa.controller

import com.villarosa.repository.model.*
import com.villarosa.service.ReservationService
import io.swagger.v3.oas.annotations.Hidden
import java.util.UUID
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

@Hidden
@RestController
class LegacyReservationController(private val service: ReservationService) {
    @PostMapping("/reservation", "/reservation/")
    fun create(
        @RequestParam customerId: Int,
        @RequestParam roomId: Int,
        @RequestParam startDate: String,
        @RequestParam endDate: String,
        @RequestParam(defaultValue = "1") guestCount: Int,
        @RequestHeader("Idempotency-Key", required = false) suppliedKey: String?,
    ): ResponseEntity<Int> {
        val result =
            service.create(
                customerId,
                roomId,
                startDate,
                endDate,
                guestCount,
                suppliedKey ?: UUID.randomUUID().toString(),
            )
        return ResponseEntity.ok().header("X-Operation-Key", result.key).body(result.resourceId)
    }

    @PatchMapping("/reservation", "/reservation/")
    fun move(
        @RequestParam reservationId: Int,
        @RequestParam newRoomId: Int,
        @RequestParam(required = false) expectedVersion: Long?,
        @RequestHeader("Idempotency-Key", required = false) key: String?,
    ) {
        service.move(reservationId, newRoomId, expectedVersion, key ?: UUID.randomUUID().toString())
    }

    @DeleteMapping("/reservation", "/reservation/")
    fun cancel(
        @RequestParam reservationId: Int,
        @RequestParam(required = false) expectedVersion: Long?,
        @RequestHeader("Idempotency-Key", required = false) key: String?,
    ) {
        service.cancel(reservationId, expectedVersion, key ?: UUID.randomUUID().toString())
    }

    @GetMapping("/reservation/available-apartments", "/reservation/available-apartments/")
    fun available(
        @RequestParam startDate: String,
        @RequestParam endDate: String,
        @RequestParam(defaultValue = "1") guestCount: Int,
    ): List<Apartment> = service.findAvailableApartments(startDate, endDate, guestCount)

    @GetMapping("/reservation/customer", "/reservation/customer/")
    fun customer(@RequestParam customerId: Int): List<ReservationInfo> =
        service.findReservationsByCustomer(customerId)
}
