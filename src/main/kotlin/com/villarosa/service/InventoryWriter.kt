package com.villarosa.service

import com.villarosa.exception.conflict
import com.villarosa.exception.invalid
import com.villarosa.exception.missing
import com.villarosa.repository.*
import com.villarosa.repository.model.*
import com.villarosa.security.BusinessScope
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
    private val readiness: ReadinessService,
    private val time: PropertyTime,
    private val allocations: RoomAllocations,
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
                    propertyId = BusinessScope.id(),
                )
            )
        quotes.accept(price, booking)
        allocations.replace(booking, listOf(RoomNightAllocation(roomId, dates.start, dates.end)))
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
        reason: String? = null,
        allowCheckedIn: Boolean = false,
        readinessVersion: Long? = null,
    ): OperationResult {
        checkGuest(
            reservations.customerId(BusinessScope.id(), id)
                ?: missing("Reservation does not exist.")
        )
        val original =
            reservations.roomId(BusinessScope.id(), id) ?: missing("Reservation does not exist.")
        val before =
            reservations.findByPropertyIdAndId(BusinessScope.id(), id)
                ?: missing("Reservation does not exist.")
        val locked = lockRooms(allocations.rooms(before).toList() + listOf(original, destination))
        val booking = current(id, expected, locked.keys)
        active(booking, allowCheckedIn)
        var event: InventoryEventInfo? = null
        var destinationReadiness: ReadinessView? = null
        if (booking.roomId != destination) {
            val room = locked.getValue(destination)
            val dates = StayDates(booking.startDate!!, booking.endDate!!)
            checkRoom(room, booking.guestCount)
            val moveDay = time.today()
            val planned = allocations.moved(booking, destination, moveDay)
            for (allocation in planned) checkAvailable(
                allocation.roomId,
                StayDates(allocation.start, allocation.end),
                id,
            )
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
            if (booking.phase == StayPhase.CHECKED_IN) {
                OperationReason.required(reason)
                if (readinessVersion == null)
                    conflict(
                        "READINESS_REVIEW_REQUIRED",
                        "Review the destination room's current readiness before moving this stay.",
                    )
                destinationReadiness = readiness.assertReady(room, readinessVersion)
                readiness.dirty(locked.getValue(original), key, id)
            }
            ensureWritable(booking)
            booking.roomFromDate =
                if (booking.phase == StayPhase.CHECKED_IN) moveDay else booking.startDate
            booking.roomId = destination
            booking.acceptedQuoteId = price.id
            reservations.saveAndFlush(booking)
            quotes.accept(price, booking)
            allocations.replace(booking, planned)
            event = reservationEvent(booking, key, "MOVED", original, reason)
        }
        return OperationResult(
            key,
            OperationKind.MOVE,
            id,
            reservation = booking.toReservationInfo(),
            inventoryEvent = event,
            readiness = destinationReadiness,
        )
    }

    fun change(
        id: Int,
        dates: StayDates,
        guestCount: Int,
        expected: Long,
        key: String,
        quoteId: String? = null,
        reason: String? = null,
        allowCheckedIn: Boolean = false,
    ): OperationResult {
        checkGuest(
            reservations.customerId(BusinessScope.id(), id)
                ?: missing("Reservation does not exist.")
        )
        val roomId =
            reservations.roomId(BusinessScope.id(), id) ?: missing("Reservation does not exist.")
        val before =
            reservations.findByPropertyIdAndId(BusinessScope.id(), id)
                ?: missing("Reservation does not exist.")
        val locked = lockRooms(allocations.rooms(before).toList() + roomId)
        val room = locked.getValue(roomId)
        val booking = current(id, expected, setOf(roomId))
        active(booking, allowCheckedIn)
        if (booking.phase == StayPhase.CHECKED_IN) {
            OperationReason.required(reason)
            val arrived = time.date(booking.checkedInAt!!)
            if (dates.start > arrived || dates.end <= arrived)
                conflict(
                    "ARRIVAL_OUTSIDE_STAY",
                    "The new dates must contain the recorded arrival date.",
                )
            if (dates.end < time.today())
                conflict(
                    "DEPARTURE_DATE_PASSED",
                    "A checked-in stay's departure date cannot precede today.",
                )
        }
        var event: InventoryEventInfo? = null
        checkRoom(room, guestCount)
        val planned = allocations.changed(booking, dates)
        for (allocation in planned) checkAvailable(
            allocation.roomId,
            StayDates(allocation.start, allocation.end),
            id,
        )
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
            ensureWritable(booking)
            if (booking.phase != StayPhase.CHECKED_IN) booking.roomFromDate = dates.start
            booking.startDate = dates.start
            booking.endDate = dates.end
            booking.guestCount = guestCount
            booking.acceptedQuoteId = price.id
            reservations.saveAndFlush(booking)
            quotes.accept(price, booking)
            allocations.replace(booking, planned)
            event = reservationEvent(booking, key, "CHANGED", reason = reason)
        }
        return OperationResult(
            key,
            OperationKind.CHANGE,
            id,
            reservation = booking.toReservationInfo(),
            inventoryEvent = event,
        )
    }

    fun cancel(id: Int, expected: Long?, key: String, reason: String? = null): OperationResult {
        val roomId =
            reservations.roomId(BusinessScope.id(), id) ?: missing("Reservation does not exist.")
        lockRooms(listOf(roomId))
        val booking = current(id, expected, setOf(roomId))
        if (booking.phase == StayPhase.NO_SHOW)
            conflict("STAY_NOT_EDITABLE", "A no-show outcome cannot be changed to cancellation.")
        var event: InventoryEventInfo? = null
        if (booking.status != ReservationStatus.CANCELLED) {
            if (booking.phase != StayPhase.CONFIRMED)
                conflict("STAY_NOT_EDITABLE", "Only a confirmed reservation can be cancelled.")
            ensureWritable(booking)
            booking.status = ReservationStatus.CANCELLED
            booking.phase = StayPhase.CANCELLED
            reservations.saveAndFlush(booking)
            event = reservationEvent(booking, key, "CANCELLED", reason = reason)
        }
        return OperationResult(
            key,
            OperationKind.CANCEL,
            id,
            reservation = booking.toReservationInfo(),
            inventoryEvent = event,
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
                    propertyId = BusinessScope.id(),
                )
            )
        blockEvent(block, key, "BLOCKED")
        return OperationResult(key, OperationKind.BLOCK, block.id!!, maintenance = block.info())
    }

    fun unblock(id: Int, expected: Long, key: String): OperationResult {
        val roomId =
            blocks.roomId(BusinessScope.id(), id) ?: missing("Maintenance block does not exist.")
        lockRooms(listOf(roomId))
        val block =
            blocks.locked(BusinessScope.id(), id) ?: missing("Maintenance block does not exist.")
        version(block.version, expected)
        if (block.status != ReservationStatus.CANCELLED) {
            block.status = ReservationStatus.CANCELLED
            blocks.saveAndFlush(block)
            blockEvent(block, key, "UNBLOCKED")
        }
        return OperationResult(key, OperationKind.UNBLOCK, id, maintenance = block.info())
    }

    private fun lockRooms(ids: List<Int>): Map<Int, Apartment> =
        ids.distinct().sorted().associateWith { id ->
            if (id <= 0) invalid("INVALID_ID", "Room ID must be positive.")
            rooms.locked(BusinessScope.id(), id) ?: missing("Room does not exist.")
        }

    private fun current(id: Int, expected: Long?, lockedRooms: Set<Int>): Reservation {
        val booking =
            reservations.locked(BusinessScope.id(), id) ?: missing("Reservation does not exist.")
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

    private fun ensureWritable(booking: Reservation) {
        if (booking.version >= EuroCents.MAX)
            conflict("VERSION_LIMIT", "This record has reached its supported version limit.")
    }

    private fun active(booking: Reservation, allowCheckedIn: Boolean = false) {
        if (booking.status != ReservationStatus.ACTIVE)
            conflict("RESERVATION_CANCELLED", "A cancelled reservation cannot be changed.")
        if (
            booking.phase != StayPhase.CONFIRMED &&
                !(allowCheckedIn && booking.phase == StayPhase.CHECKED_IN)
        )
            conflict("STAY_NOT_EDITABLE", "This stay is already in progress or closed.")
    }

    private fun checkRoom(room: Apartment, guestCount: Int) {
        if (guestCount <= 0) invalid("INVALID_GUEST_COUNT", "Guest count must be positive.")
        if (guestCount > (room.capacity ?: 0))
            invalid("CAPACITY_EXCEEDED", "Guest count exceeds room capacity.")
        if (!room.active) conflict("ROOM_INACTIVE", "The room is inactive.")
    }

    private fun checkGuest(id: Int) {
        val guest = guests.locked(BusinessScope.id(), id) ?: missing("Guest does not exist.")
        if (!guest.active)
            conflict("GUEST_ARCHIVED", "Restore this guest before making a reservation change.")
    }

    private fun checkAvailable(roomId: Int, dates: StayDates, excluded: Int = -1) {
        if (!availability.available(roomId, dates, excluded))
            conflict("INVENTORY_CONFLICT", "The room is unavailable for those dates.")
    }

    fun reservationEvent(
        booking: Reservation,
        key: String,
        kind: String,
        previous: Int? = null,
        reason: String? = null,
    ): InventoryEventInfo {
        val event =
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
                    phase = booking.phase,
                    checkedInAt = booking.checkedInAt,
                    checkedOutAt = booking.checkedOutAt,
                    roomFromDate = booking.roomFromDate,
                    reason = reason,
                    occurredAt = time.now(),
                    propertyId = BusinessScope.id(),
                )
            )
        return InventoryEventInfo.from(event)
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
                propertyId = BusinessScope.id(),
            )
        )
    }
}
