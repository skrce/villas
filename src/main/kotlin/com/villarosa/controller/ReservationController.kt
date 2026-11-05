package com.villarosa.controller

import com.villarosa.repository.model.Apartment
import com.villarosa.repository.model.ReservationInfo
import com.villarosa.service.ReservationService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.tags.Tag
import org.slf4j.LoggerFactory
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@Tag(name = "Reservation")
@RestController
class ReservationController(private val reservationService: ReservationService) {
    companion object {
        private val LOGGER = LoggerFactory.getLogger(ReservationController::class.java)
    }

    @PostMapping(
        value = ["/reservation", "/api/v1/reservations"],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        summary = "Creates a reservation (for room and customer).",
        operationId = "createReservation",
    )
    fun createReservation(
        @Parameter(description = "Customer ID") @RequestParam("customerId") customerId: Int,
        @Parameter(description = "Room ID") @RequestParam("roomId") roomId: Int,
        @Parameter(description = "Start Date, format: YYYY-MM-DD")
        @RequestParam("startDate")
        startDateString: String,
        @Parameter(description = "End Date, format: YYYY-MM-DD")
        @RequestParam("endDate")
        endDateString: String,
    ): Int {
        LOGGER.info(
            "Called createReservation() with customerId {}, roomId {}, startDate {}, endDate {}",
            customerId,
            roomId,
            startDateString,
            endDateString,
        )
        return reservationService.createReservation(
            customerId,
            roomId,
            startDateString,
            endDateString,
        )
    }

    @GetMapping(
        value = ["/reservation/available-apartments", "/api/v1/reservations/available-apartments"],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        summary = "Find all available apartments available for a date range.",
        operationId = "findAvailableApartments",
    )
    fun findAvailableApartments(
        @Parameter(description = "Start Date, format: YYYY-MM-DD")
        @RequestParam("startDate")
        startDateString: String,
        @Parameter(description = "End Date, format: YYYY-MM-DD")
        @RequestParam("endDate")
        endDateString: String,
    ): List<Apartment> {
        LOGGER.info(
            "Called findAvailableApartments() with startDate {}, endDate {}",
            startDateString,
            endDateString,
        )
        return reservationService.findAvailableApartments(startDateString, endDateString)
    }

    @GetMapping(
        value = ["/reservation/customer", "/api/v1/reservations/customer"],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        summary = "Find all reservations for a given customer.",
        operationId = "findReservationsByCustomer",
    )
    fun findReservationsByCustomer(
        @Parameter(description = "Customer ID") @RequestParam("customerId") customerId: Int
    ): List<ReservationInfo> {
        LOGGER.info("Called findReservations() with customerId {}", customerId)
        return reservationService.findReservationsByCustomer(customerId)
    }

    @DeleteMapping(
        value = ["/reservation", "/reservation/", "/api/v1/reservations"],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(summary = "Deletes a reservation.", operationId = "cancelReservation")
    fun cancelReservation(
        @Parameter(description = "Reservation ID") @RequestParam("reservationId") reservationId: Int
    ) {
        LOGGER.info("Called cancelReservation() with reservationId {}", reservationId)
        reservationService.cancelReservation(reservationId)
    }

    @PatchMapping(
        value = ["/reservation", "/reservation/", "/api/v1/reservations"],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(summary = "Updates a reservation's room.", operationId = "updateReservationRoom")
    fun updateReservationRoom(
        @Parameter(description = "Reservation ID")
        @RequestParam("reservationId")
        reservationId: Int,
        @Parameter(description = "New Room ID") @RequestParam("newRoomId") newRoomId: Int,
    ) {
        LOGGER.info(
            "Called updateReservationRoom() with reservationId and newRoomId{}",
            reservationId,
            newRoomId,
        )
        reservationService.updateReservationRoom(reservationId, newRoomId)
    }
}
