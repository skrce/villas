package com.villarosa.service

import com.villarosa.exception.invalid
import com.villarosa.exception.missing
import com.villarosa.repository.ApartmentRepository
import com.villarosa.repository.InventoryAvailability
import com.villarosa.repository.ReservationRepository
import com.villarosa.repository.model.*
import com.villarosa.security.CurrentStaff
import com.villarosa.security.StaffAccess
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
    private val current: CurrentStaff,
    private val access: StaffAccess,
    private val quotes: QuoteService,
) {
    fun createQuoted(
        customerId: Int,
        suppliedQuote: String,
        roomId: Int,
        start: String,
        end: String,
        guestCount: Int,
        key: String,
    ): OperationResult {
        val quoteId = quotes.id(suppliedQuote)
        val dates = StayDates.parse(start, end)
        try {
            return operations.execute(
                OperationKind.CREATE,
                key,
                listOf("QUOTED", customerId, quoteId, roomId, start, end, guestCount),
            ) { operationKey ->
                writer.create(
                    customerId,
                    roomId,
                    dates,
                    guestCount,
                    operationKey,
                    quoteId,
                )
            }
        } catch (changed: QuoteReviewRequired) {
            throw quotes.refresh(changed.quoteId)
        }
    }

    fun create(
        customerId: Int,
        roomId: Int,
        start: String,
        end: String,
        guestCount: Int,
        key: String,
        quoteId: String? = null,
    ): OperationResult {
        if (quoteId != null)
            return createQuoted(customerId, quoteId, roomId, start, end, guestCount, key)
        val dates = StayDates.parse(start, end)
        return operations.execute(
            OperationKind.CREATE,
            key,
            listOf(customerId, roomId, start, end, guestCount),
        ) {
            writer.create(customerId, roomId, dates, guestCount, it)
        }
    }

    fun move(
        id: Int,
        roomId: Int,
        version: Long?,
        key: String,
        quoteId: String? = null,
    ): OperationResult {
        val quoted = quoteId?.let(quotes::id)
        try {
            return operations.execute(
                OperationKind.MOVE,
                key,
                if (quoted == null) listOf(id, roomId, version)
                else listOf("QUOTED", id, roomId, version, quoted),
            ) {
                writer.move(id, roomId, version, it, quoted)
            }
        } catch (changed: QuoteReviewRequired) {
            throw quotes.refresh(changed.quoteId)
        }
    }

    fun change(
        id: Int,
        start: String,
        end: String,
        guestCount: Int,
        version: Long,
        key: String,
        quoteId: String? = null,
    ): OperationResult {
        val dates = StayDates.parse(start, end)
        val quoted = quoteId?.let(quotes::id)
        try {
            return operations.execute(
                OperationKind.CHANGE,
                key,
                if (quoted == null) listOf(id, start, end, guestCount, version)
                else listOf("QUOTED", id, start, end, guestCount, version, quoted),
            ) {
                writer.change(id, dates, guestCount, version, it, quoted)
            }
        } catch (changed: QuoteReviewRequired) {
            throw quotes.refresh(changed.quoteId)
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
    fun reservation(id: Int): ReservationInfo {
        access.current(current.identity())
        return (reservations.findByPropertyIdAndId(PropertyScope.ID, id)
                ?: missing("Reservation does not exist."))
            .toReservationInfo()
    }

    @Transactional(readOnly = true)
    fun findAvailableApartments(
        startDateString: String,
        endDateString: String,
        guestCount: Int = 1,
    ): List<Apartment> {
        access.current(current.identity())
        val dates = StayDates.parse(startDateString, endDateString)
        if (guestCount <= 0) invalid("INVALID_GUEST_COUNT", "Guest count must be positive.")
        return rooms.findByPropertyId(PropertyScope.ID).filter {
            it.active && (it.capacity ?: 0) >= guestCount && availability.available(it.id!!, dates)
        }
    }

    @Transactional(readOnly = true)
    fun findReservationsByCustomer(customerId: Int): List<ReservationInfo> {
        access.current(current.identity())
        return reservations
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
    }

    fun createReservation(
        customerId: Int,
        roomId: Int,
        startDateString: String,
        endDateString: String,
        quoteId: String? = null,
    ): Int =
        create(
                customerId,
                roomId,
                startDateString,
                endDateString,
                1,
                UUID.randomUUID().toString(),
                quoteId,
            )
            .resourceId

    fun updateReservationRoom(reservationId: Int, newRoomId: Int, quoteId: String? = null) {
        move(reservationId, newRoomId, null, UUID.randomUUID().toString(), quoteId)
    }

    fun cancelReservation(reservationId: Int) {
        cancel(reservationId, null, UUID.randomUUID().toString())
    }
}
