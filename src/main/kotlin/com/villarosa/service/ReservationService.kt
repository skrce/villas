package com.villarosa.service

import com.villarosa.exception.ExceptionHandler
import com.villarosa.repository.ReservationRepository
import com.villarosa.repository.model.Apartment
import com.villarosa.repository.model.Reservation
import com.villarosa.repository.model.ReservationInfo
import java.time.LocalDate
import org.springframework.stereotype.Service

@Service
class ReservationService(
    private val reservationRepository: ReservationRepository,
    private val apartmentService: ApartmentService,
    private val customerService: CustomerService,
) {

    fun createReservation(
        customerId: Int,
        roomId: Int,
        startDateString: String,
        endDateString: String,
    ): Int {
        val dates = StayDates.parse(startDateString, endDateString)
        val startDate = dates.start
        val endDate = dates.end

        val customer = customerService.findCustomerById(customerId)
        if (customer.isPresent.not()) {
            throw ExceptionHandler.ClientException("Customer does not exist!")
        }

        val existingReservationsForRoom = reservationRepository.findByRoomId(roomId)

        val overlappingReservations =
            findOverlappingReservations(existingReservationsForRoom, startDate, endDate)

        if (overlappingReservations.isNotEmpty()) {
            throw ExceptionHandler.ClientException(
                "Existing overlapping reservations exists: " +
                    overlappingReservations.joinToString()
            )
        }

        return reservationRepository
            .save(Reservation.buildReservation(customerId, roomId, startDate, endDate))
            .id!!
    }

    fun findAvailableApartments(startDateString: String, endDateString: String): List<Apartment> {
        val dates = StayDates.parse(startDateString, endDateString)
        val startDate = dates.start
        val endDate = dates.end

        val allApartments = apartmentService.getAllApartments()
        val potentialOverlappingReservations =
            reservationRepository.findByStartDateBeforeAndEndDateAfter(endDate, startDate)

        val overlappingReservationsRoomIds =
            findOverlappingReservations(potentialOverlappingReservations, startDate, endDate).map {
                it.roomId
            }

        return allApartments.filter { it.id !in overlappingReservationsRoomIds }
    }

    fun cancelReservation(reservationId: Int) {
        val reservationOptional = reservationRepository.findById(reservationId)
        if (reservationOptional.isPresent.not()) {
            throw ExceptionHandler.ClientException("Reservation does not exist.")
        }
        val reservation = reservationOptional.get()
        reservationRepository.delete(reservation)
    }

    fun updateReservationRoom(reservationId: Int, newRoomId: Int) {
        val reservationOptional = reservationRepository.findById(reservationId)
        if (reservationOptional.isPresent.not()) {
            throw ExceptionHandler.ClientException("Reservation does not exist.")
        }

        apartmentService.findApartmentById(newRoomId)
            ?: throw ExceptionHandler.ClientException("Room does not exist.")

        val reservation = reservationOptional.get()

        val newRoomReservations = reservationRepository.findByRoomId(newRoomId)

        val newRoomReservationForPeriodOfExistingReservation =
            findOverlappingReservations(
                newRoomReservations,
                reservation.startDate!!,
                reservation.endDate!!,
            )
        if (newRoomReservationForPeriodOfExistingReservation.isNotEmpty()) {
            val newRoomOverlappingReservation =
                newRoomReservationForPeriodOfExistingReservation.first()
            throw ExceptionHandler.ClientException(
                "New room has overlapping reservation: " +
                    "customer-id: ${newRoomOverlappingReservation.customerId}, " +
                    "start-date: ${newRoomOverlappingReservation.startDate}, " +
                    "end-date: ${newRoomOverlappingReservation.endDate}"
            )
        }

        val updatedReservation = reservation.copy(roomId = newRoomId)
        reservationRepository.save(updatedReservation)
    }

    fun findReservationsByCustomer(customerId: Int): List<ReservationInfo> =
        reservationRepository
            .findByCustomerId(customerId)
            .map { it.toReservationInfo() }
            .sortedBy { it.startDate }
            .reversed()

    private fun findOverlappingReservations(
        reservations: List<Reservation>,
        startDate: LocalDate,
        endDate: LocalDate,
    ) = reservations.filter { StayDates(startDate, endDate).overlaps(it.startDate!!, it.endDate!!) }
}
