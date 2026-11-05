package com.villarosa.controller

import com.villarosa.repository.model.Apartment
import com.villarosa.repository.model.ReservationInfo
import com.villarosa.service.ReservationService
import io.swagger.annotations.ApiOperation
import io.swagger.annotations.ApiParam
import org.slf4j.LoggerFactory
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
class ReservationController(private val reservationService: ReservationService) {
    companion object {
        private val LOGGER = LoggerFactory.getLogger(ReservationController::class.java)
    }

    @PostMapping(value = ["/reservation"],
                 produces = [MediaType.APPLICATION_JSON_VALUE])
    @ApiOperation(value = "Creates a reservation (for room and customer).")
    fun createReservation(@ApiParam(value = "Customer ID")
                          @RequestParam("customerId") customerId: Int,
                          @ApiParam(value = "Room ID")
                          @RequestParam("roomId") roomId: Int,
                          @ApiParam(value = "Start Date, format: YYYY-MM-DD")
                          @RequestParam("startDate") startDateString: String,
                          @ApiParam(value = "End Date, format: YYYY-MM-DD")
                          @RequestParam("endDate") endDateString: String): Int {
        LOGGER.info("Called createReservation() with customerId {}, roomId {}, startDate {}, endDate {}", customerId, roomId, startDateString, endDateString)
        return reservationService.createReservation(customerId, roomId, startDateString, endDateString)
    }

    @GetMapping(value = ["/reservation/available-apartments"],
                produces = [MediaType.APPLICATION_JSON_VALUE])
    @ApiOperation(value = "Find all available apartments available for a date range.")
    fun findAvailableApartments(@ApiParam(value = "Start Date, format: YYYY-MM-DD")
                                @RequestParam("startDate") startDateString: String,
                                @ApiParam(value = "End Date, format: YYYY-MM-DD")
                                @RequestParam("endDate") endDateString: String): List<Apartment> {
        LOGGER.info("Called findAvailableApartments() with startDate {}, endDate {}", startDateString, endDateString)
        return reservationService.findAvailableApartments(startDateString, endDateString)
    }

    @GetMapping(value = ["/reservation/customer"],
                produces = [MediaType.APPLICATION_JSON_VALUE])
    @ApiOperation(value = "Find all reservations for a given customer.")
    fun findReservationsByCustomer(@ApiParam(value = "Customer ID")
                                   @RequestParam("customerId") customerId: Int): List<ReservationInfo> {
        LOGGER.info("Called findReservations() with customerId {}", customerId)
        return reservationService.findReservationsByCustomer(customerId)
    }

    @DeleteMapping(value = ["/reservation", "/reservation/"],
                   produces = [MediaType.APPLICATION_JSON_VALUE])
    @ApiOperation(value = "Deletes a reservation.")
    fun cancelReservation(@ApiParam(value = "Reservation ID")
                          @RequestParam("reservationId") reservationId: Int) {
        LOGGER.info("Called cancelReservation() with reservationId {}", reservationId)
        reservationService.cancelReservation(reservationId)
    }

    @PatchMapping(value = ["/reservation", "/reservation/"],
                  produces = [MediaType.APPLICATION_JSON_VALUE])
    @ApiOperation(value = "Updates a reservation's room.")
    fun updateReservationRoom(@ApiParam(value = "Reservation ID")
                              @RequestParam("reservationId") reservationId: Int,
                              @ApiParam(value = "New Room ID")
                              @RequestParam("newRoomId") newRoomId: Int) {
        LOGGER.info("Called updateReservationRoom() with reservationId and newRoomId{}", reservationId, newRoomId)
        reservationService.updateReservationRoom(reservationId, newRoomId)
    }
}
