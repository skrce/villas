package com.villarosa.service

import com.villarosa.exception.invalid
import com.villarosa.exception.missing
import com.villarosa.repository.ApartmentRepository
import com.villarosa.repository.InventoryAvailability
import com.villarosa.repository.ReservationRepository
import com.villarosa.repository.model.*
import java.util.UUID
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Sort
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class ReservationService(
    private val operations: OperationCoordinator,
    private val writer: InventoryWriter,
    private val reservations: ReservationRepository,
    private val rooms: ApartmentRepository,
    private val availability: InventoryAvailability,
) {
    fun create(
        customerId: Int,
        roomId: Int,
        start: String,
        end: String,
        guestCount: Int,
        key: String,
    ): OperationResult {
        val dates = StayDates.parse(start, end)
        return operations.execute(
            OperationKind.CREATE,
            key,
            listOf(customerId, roomId, start, end, guestCount),
        ) {
            writer.create(customerId, roomId, dates, guestCount, it)
        }
    }

    fun move(id: Int, roomId: Int, version: Long?, key: String): OperationResult =
        operations.execute(OperationKind.MOVE, key, listOf(id, roomId, version)) {
            writer.move(id, roomId, version, it)
        }

    fun change(
        id: Int,
        start: String,
        end: String,
        guestCount: Int,
        version: Long,
        key: String,
    ): OperationResult {
        val dates = StayDates.parse(start, end)
        return operations.execute(
            OperationKind.CHANGE,
            key,
            listOf(id, start, end, guestCount, version),
        ) {
            writer.change(id, dates, guestCount, version, it)
        }
    }

    fun cancel(id: Int, version: Long?, key: String): OperationResult =
        operations.execute(OperationKind.CANCEL, key, listOf(id, version)) {
            writer.cancel(id, version, it)
        }

    fun block(
        roomId: Int,
        start: String,
        end: String,
        reason: String,
        key: String,
    ): OperationResult {
        val dates = StayDates.parse(start, end)
        val normalized = reason.trim()
        if (normalized.isEmpty() || normalized.length > 200)
            invalid("INVALID_REASON", "Maintenance reason must contain 1 to 200 characters.")
        return operations.execute(
            OperationKind.BLOCK,
            key,
            listOf(roomId, start, end, normalized),
        ) {
            writer.block(roomId, dates, normalized, it)
        }
    }

    fun unblock(id: Int, version: Long, key: String): OperationResult =
        operations.execute(OperationKind.UNBLOCK, key, listOf(id, version)) {
            writer.unblock(id, version, it)
        }

    fun operation(kind: OperationKind, key: String): OperationResult = operations.find(kind, key)

    @Transactional(readOnly = true)
    fun reservation(id: Int): ReservationInfo =
        (reservations.findByPropertyIdAndId(PropertyScope.ID, id)
                ?: missing("Reservation does not exist."))
            .toReservationInfo()

    @Transactional(readOnly = true)
    fun findAvailableApartments(
        startDateString: String,
        endDateString: String,
        guestCount: Int = 1,
    ): List<Apartment> {
        val dates = StayDates.parse(startDateString, endDateString)
        if (guestCount <= 0) invalid("INVALID_GUEST_COUNT", "Guest count must be positive.")
        return rooms.findByPropertyId(PropertyScope.ID).filter {
            it.active && (it.capacity ?: 0) >= guestCount && availability.available(it.id!!, dates)
        }
    }

    @Transactional(readOnly = true)
    fun findReservationsByCustomer(customerId: Int): List<ReservationInfo> =
        reservations
            .findByPropertyIdAndCustomerIdAndStatus(
                PropertyScope.ID,
                customerId,
                ReservationStatus.ACTIVE,
                PageRequest.of(
                    0,
                    100,
                    Sort.by(Sort.Order.desc("startDate"), Sort.Order.desc("id")),
                ),
            )
            .map { it.toReservationInfo() }

    fun createReservation(
        customerId: Int,
        roomId: Int,
        startDateString: String,
        endDateString: String,
    ): Int =
        create(customerId, roomId, startDateString, endDateString, 1, UUID.randomUUID().toString())
            .resourceId

    fun updateReservationRoom(reservationId: Int, newRoomId: Int) {
        move(reservationId, newRoomId, null, UUID.randomUUID().toString())
    }

    fun cancelReservation(reservationId: Int) {
        cancel(reservationId, null, UUID.randomUUID().toString())
    }
}
