package com.villarosa.service

import com.villarosa.exception.conflict
import com.villarosa.exception.invalid
import com.villarosa.exception.missing
import com.villarosa.repository.*
import com.villarosa.repository.model.*
import com.villarosa.security.CurrentStaff
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional

@Service
@Transactional(propagation = Propagation.MANDATORY)
class InventoryWriter(
    private val rooms: ApartmentRepository,
    private val guests: CustomerRepository,
    private val reservations: ReservationRepository,
    private val blocks: MaintenanceRepository,
    private val events: InventoryEventRepository,
    private val availability: InventoryAvailability,
    private val currentStaff: CurrentStaff,
    private val quotes: QuoteService,
) {
    fun create(
        customerId: Int,
        roomId: Int,
        dates: StayDates,
        guestCount: Int,
        key: String,
        quoteId: String? = null,
    ): OperationResult {
        checkGuest(customerId)
        val room = lockRooms(listOf(roomId)).getValue(roomId)
        checkRoom(room, guestCount)
        checkAvailable(roomId, dates)
        val price =
            quotes.acceptable(
                quoteId
                    ?: conflict(
                        "QUOTE_REQUIRED",
                        "Review and accept a quote before saving a new booking.",
                    ),
                room,
                dates,
                guestCount,
            )
        val booking =
            reservations.saveAndFlush(
                Reservation(
                    null,
                    customerId,
                    roomId,
                    dates.start,
                    dates.end,
                    guestCount,
                    acceptedQuoteId = price.id,
                )
            )
        quotes.accept(price, booking)
        reservationEvent(booking, key, "CREATED")
        return OperationResult(
            key,
            OperationKind.CREATE,
            booking.id!!,
            reservation = booking.toReservationInfo(),
        )
    }

    fun move(
        id: Int,
        destination: Int,
        expected: Long?,
        key: String,
        quoteId: String? = null,
    ): OperationResult {
        checkGuest(
            reservations.customerId(PropertyScope.ID, id) ?: missing("Reservation does not exist.")
        )
        val original =
            reservations.roomId(PropertyScope.ID, id) ?: missing("Reservation does not exist.")
        val locked = lockRooms(listOf(original, destination))
        val booking = current(id, expected, locked.keys)
        active(booking)
        if (booking.roomId != destination) {
            val room = locked.getValue(destination)
            val dates = StayDates(booking.startDate!!, booking.endDate!!)
            checkRoom(room, booking.guestCount)
            checkAvailable(destination, dates, id)
            val price =
                quotes.acceptable(
                    quoteId
                        ?: conflict(
                            "PRICE_REVIEW_REQUIRED",
                            "Review and accept a new quote before changing rooms.",
                        ),
                    room,
                    dates,
                    booking.guestCount,
                )
            booking.roomId = destination
            booking.acceptedQuoteId = price.id
            reservations.saveAndFlush(booking)
            quotes.accept(price, booking)
            reservationEvent(booking, key, "MOVED", original)
        }
        return OperationResult(
            key,
            OperationKind.MOVE,
            id,
            reservation = booking.toReservationInfo(),
        )
    }

    fun change(
        id: Int,
        dates: StayDates,
        guestCount: Int,
        expected: Long,
        key: String,
        quoteId: String? = null,
    ): OperationResult {
        checkGuest(
            reservations.customerId(PropertyScope.ID, id) ?: missing("Reservation does not exist.")
        )
        val roomId =
            reservations.roomId(PropertyScope.ID, id) ?: missing("Reservation does not exist.")
        val room = lockRooms(listOf(roomId)).getValue(roomId)
        val booking = current(id, expected, setOf(roomId))
        active(booking)
        checkRoom(room, guestCount)
        checkAvailable(roomId, dates, id)
        if (
            booking.startDate != dates.start ||
                booking.endDate != dates.end ||
                booking.guestCount != guestCount
        ) {
            val price =
                quotes.acceptable(
                    quoteId
                        ?: conflict(
                            "PRICE_REVIEW_REQUIRED",
                            "Review and accept a new quote before changing the stay.",
                        ),
                    room,
                    dates,
                    guestCount,
                )
            booking.startDate = dates.start
            booking.endDate = dates.end
            booking.guestCount = guestCount
            booking.acceptedQuoteId = price.id
            reservations.saveAndFlush(booking)
            quotes.accept(price, booking)
            reservationEvent(booking, key, "CHANGED")
        }
        return OperationResult(
            key,
            OperationKind.CHANGE,
            id,
            reservation = booking.toReservationInfo(),
        )
    }

    fun cancel(id: Int, expected: Long?, key: String): OperationResult {
        val roomId =
            reservations.roomId(PropertyScope.ID, id) ?: missing("Reservation does not exist.")
        lockRooms(listOf(roomId))
        val booking = current(id, expected, setOf(roomId))
        if (booking.status != ReservationStatus.CANCELLED) {
            booking.status = ReservationStatus.CANCELLED
            reservations.saveAndFlush(booking)
            reservationEvent(booking, key, "CANCELLED")
        }
        return OperationResult(
            key,
            OperationKind.CANCEL,
            id,
            reservation = booking.toReservationInfo(),
        )
    }

    fun block(roomId: Int, dates: StayDates, reason: String, key: String): OperationResult {
        val room = lockRooms(listOf(roomId)).getValue(roomId)
        if (!room.active) conflict("ROOM_INACTIVE", "Restore this room before adding maintenance.")
        checkAvailable(roomId, dates)
        val block =
            blocks.saveAndFlush(
                MaintenanceBlock(
                    roomId = roomId,
                    startDate = dates.start,
                    endDate = dates.end,
                    reason = reason,
                )
            )
        blockEvent(block, key, "BLOCKED")
        return OperationResult(key, OperationKind.BLOCK, block.id!!, maintenance = block)
    }

    fun unblock(id: Int, expected: Long, key: String): OperationResult {
        val roomId =
            blocks.roomId(PropertyScope.ID, id) ?: missing("Maintenance block does not exist.")
        lockRooms(listOf(roomId))
        val block =
            blocks.locked(PropertyScope.ID, id) ?: missing("Maintenance block does not exist.")
        version(block.version, expected)
        if (block.status != ReservationStatus.CANCELLED) {
            block.status = ReservationStatus.CANCELLED
            blocks.saveAndFlush(block)
            blockEvent(block, key, "UNBLOCKED")
        }
        return OperationResult(key, OperationKind.UNBLOCK, id, maintenance = block)
    }

    private fun lockRooms(ids: List<Int>): Map<Int, Apartment> =
        ids.distinct().sorted().associateWith { id ->
            if (id <= 0) invalid("INVALID_ID", "Room ID must be positive.")
            rooms.locked(PropertyScope.ID, id) ?: missing("Room does not exist.")
        }

    private fun current(id: Int, expected: Long?, lockedRooms: Set<Int>): Reservation {
        val booking =
            reservations.locked(PropertyScope.ID, id) ?: missing("Reservation does not exist.")
        if (expected != null) version(booking.version, expected)
        if (booking.roomId !in lockedRooms)
            conflict("RESERVATION_CHANGED", "The reservation moved. Reload it before editing.")
        return booking
    }

    private fun version(actual: Long, expected: Long) {
        if (expected < 0) invalid("INVALID_VERSION", "Version must not be negative.")
        if (actual != expected)
            conflict("STALE_VERSION", "The record changed. Reload it before editing.")
    }

    private fun active(booking: Reservation) {
        if (booking.status != ReservationStatus.ACTIVE)
            conflict("RESERVATION_CANCELLED", "A cancelled reservation cannot be changed.")
    }

    private fun checkRoom(room: Apartment, guestCount: Int) {
        if (guestCount <= 0) invalid("INVALID_GUEST_COUNT", "Guest count must be positive.")
        if (guestCount > (room.capacity ?: 0))
            invalid("CAPACITY_EXCEEDED", "Guest count exceeds room capacity.")
        if (!room.active) conflict("ROOM_INACTIVE", "The room is inactive.")
    }

    private fun checkGuest(id: Int) {
        val guest = guests.locked(PropertyScope.ID, id) ?: missing("Guest does not exist.")
        if (!guest.active)
            conflict("GUEST_ARCHIVED", "Restore this guest before making a reservation change.")
    }

    private fun checkAvailable(roomId: Int, dates: StayDates, excluded: Int = -1) {
        if (!availability.available(roomId, dates, excluded))
            conflict("INVENTORY_CONFLICT", "The room is unavailable for those dates.")
    }

    private fun reservationEvent(
        booking: Reservation,
        key: String,
        kind: String,
        previous: Int? = null,
    ) {
        events.saveAndFlush(
            InventoryEvent(
                actorId = currentStaff.identity().id,
                operationKey = key,
                kind = kind,
                reservationId = booking.id,
                resourceVersion = booking.version,
                roomId = booking.roomId!!,
                previousRoomId = previous,
                startDate = booking.startDate!!,
                endDate = booking.endDate!!,
                guestCount = booking.guestCount,
            )
        )
    }

    private fun blockEvent(block: MaintenanceBlock, key: String, kind: String) {
        events.saveAndFlush(
            InventoryEvent(
                actorId = currentStaff.identity().id,
                operationKey = key,
                kind = kind,
                maintenanceBlockId = block.id,
                resourceVersion = block.version,
                roomId = block.roomId,
                startDate = block.startDate,
                endDate = block.endDate,
            )
        )
    }
}
