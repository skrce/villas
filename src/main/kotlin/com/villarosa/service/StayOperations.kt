package com.villarosa.service

import com.villarosa.exception.conflict
import com.villarosa.exception.invalid
import com.villarosa.exception.missing
import com.villarosa.repository.*
import com.villarosa.repository.model.*
import com.villarosa.security.BusinessScope
import java.time.Instant
import java.time.LocalDateTime
import java.time.format.DateTimeParseException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional

@Service
class StayOperations(
    private val operations: OperationCoordinator,
    private val writer: StayWriter,
    private val inventory: InventoryWriter,
    private val quotes: QuoteService,
) {
    fun checkIn(id: Int, expected: Long, readyVersion: Long, key: String) =
        operations.execute(OperationKind.CHECK_IN, key, listOf(id, expected, readyVersion)) {
            writer.checkIn(id, expected, readyVersion, it)
        }

    fun checkOut(
        id: Int,
        expected: Long,
        acknowledgeBalance: Boolean,
        reason: String?,
        key: String,
    ): OperationResult {
        val explanation = OperationReason.optional(reason)
        return operations.execute(
            OperationKind.CHECK_OUT,
            key,
            listOf(id, expected, acknowledgeBalance, explanation),
        ) {
            writer.checkOut(id, expected, acknowledgeBalance, explanation, it)
        }
    }

    fun noShow(id: Int, expected: Long, reason: String?, key: String): OperationResult {
        val explanation = OperationReason.required(reason)
        return operations.execute(OperationKind.NO_SHOW, key, listOf(id, expected, explanation)) {
            writer.noShow(id, expected, explanation, it)
        }
    }

    fun cancel(id: Int, expected: Long, reason: String?, key: String): OperationResult {
        val explanation = OperationReason.required(reason)
        return operations.execute(
            OperationKind.CANCEL,
            key,
            listOf("OPERATIONS-v1", id, expected, explanation),
        ) {
            inventory.cancel(id, expected, it, explanation)
        }
    }

    fun move(
        id: Int,
        destination: Int,
        expected: Long,
        quoteId: String?,
        readyVersion: Long?,
        reason: String?,
        key: String,
    ): OperationResult {
        val explanation = OperationReason.required(reason)
        val quote = quoteId?.let(quotes::id)
        try {
            return operations.execute(
                OperationKind.MOVE,
                key,
                listOf(
                    "OPERATIONS-v1",
                    id,
                    destination,
                    expected,
                    quote,
                    readyVersion,
                    explanation,
                ),
            ) {
                inventory.move(
                    id,
                    destination,
                    expected,
                    it,
                    quote,
                    explanation,
                    true,
                    readyVersion,
                )
            }
        } catch (changed: QuoteReviewRequired) {
            throw quotes.refresh(changed.quoteId)
        }
    }

    fun change(
        id: Int,
        start: String,
        end: String,
        count: Int,
        expected: Long,
        quoteId: String?,
        reason: String?,
        key: String,
    ): OperationResult {
        val explanation = OperationReason.required(reason)
        val quote = quoteId?.let(quotes::id)
        val dates = StayDates.parse(start, end)
        try {
            return operations.execute(
                OperationKind.CHANGE,
                key,
                listOf("OPERATIONS-v1", id, start, end, count, expected, quote, explanation),
            ) {
                inventory.change(id, dates, count, expected, it, quote, explanation, true)
            }
        } catch (changed: QuoteReviewRequired) {
            throw quotes.refresh(changed.quoteId)
        }
    }

    fun correct(
        id: Int,
        expected: Long,
        checkIn: String,
        checkOut: String?,
        reason: String?,
        key: String,
    ): OperationResult {
        val explanation = OperationReason.required(reason)
        val arrival = OperationTimes.instant(checkIn)
        val departure = checkOut?.let(OperationTimes::instant)
        return operations.execute(
            OperationKind.CORRECT_STAY,
            key,
            listOf(id, expected, arrival, departure, explanation),
        ) {
            writer.correct(id, expected, arrival, departure, explanation, it)
        }
    }
}

object OperationTimes {
    fun instant(value: String): Instant {
        if (
            !value.matches(
                Regex(
                    "[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-5][0-9](\\.[0-9]{1,6})?Z"
                )
            )
        )
            invalid(
                "INVALID_OPERATION_TIME",
                "Use an exact UTC time with at most six fractional digits.",
            )
        return try {
            Instant.parse(value)
        } catch (_: DateTimeParseException) {
            invalid("INVALID_OPERATION_TIME", "Use a valid UTC date and time.")
        }
    }

    fun local(value: String): LocalDateTime {
        if (
            !value.matches(
                Regex(
                    "[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-5][0-9](\\.[0-9]{1,6})?)?"
                )
            )
        )
            invalid(
                "INVALID_OPERATION_TIME",
                "Use a property date and time with at most six fractional digits.",
            )
        return try {
            LocalDateTime.parse(value)
        } catch (_: DateTimeParseException) {
            invalid("INVALID_OPERATION_TIME", "Use a valid property date and time.")
        }
    }
}

@Service
@Transactional(propagation = Propagation.MANDATORY)
class StayWriter(
    private val rooms: ApartmentRepository,
    private val reservations: ReservationRepository,
    private val readiness: ReadinessService,
    private val availability: InventoryAvailability,
    private val inventory: InventoryWriter,
    private val ledger: LedgerService,
    private val quotes: QuoteService,
    private val time: PropertyTime,
) {
    private fun locked(id: Int, expected: Long): Pair<Apartment, Reservation> {
        val roomId =
            reservations.roomId(BusinessScope.id(), id) ?: missing("Reservation does not exist.")
        val room = rooms.locked(BusinessScope.id(), roomId) ?: missing("Room does not exist.")
        val booking =
            reservations.locked(BusinessScope.id(), id) ?: missing("Reservation does not exist.")
        ReadinessService.checkVersion(booking.version, expected)
        if (booking.roomId != roomId)
            conflict("RESERVATION_CHANGED", "The reservation moved. Reload it before confirming.")
        if (booking.version >= EuroCents.MAX)
            conflict("VERSION_LIMIT", "This record has reached its supported version limit.")
        return room to booking
    }

    private fun phase(booking: Reservation, expected: StayPhase) {
        if (booking.phase != expected)
            conflict(
                "INVALID_STAY_TRANSITION",
                "This action is unavailable for the current stay status.",
            )
    }

    fun checkIn(id: Int, expected: Long, readyVersion: Long, key: String): OperationResult {
        val (room, booking) = locked(id, expected)
        phase(booking, StayPhase.CONFIRMED)
        val now = time.now()
        val today = time.date(now)
        if (today < booking.startDate!! || today >= booking.endDate!!)
            conflict(
                "CHECK_IN_DATE",
                "Check in only within the booked dates, before the departure day.",
            )
        if (!room.active) conflict("ROOM_INACTIVE", "Restore the room before checking in.")
        if (booking.guestCount > (room.capacity ?: 0))
            conflict("CAPACITY_EXCEEDED", "The room cannot accommodate this party.")
        if (quotes.currentPrice(id) == null)
            conflict("AGREED_PRICE_REQUIRED", "An agreed EUR price is required before check-in.")
        if (
            !availability.available(
                room.id!!,
                StayDates(booking.startDate!!, booking.endDate!!),
                id,
            )
        )
            conflict(
                "INVENTORY_CONFLICT",
                "Resolve conflicting reservations or maintenance before check-in.",
            )
        val ready = readiness.assertReady(room, readyVersion)
        booking.phase = StayPhase.CHECKED_IN
        booking.checkedInAt = now
        return save(booking, key, OperationKind.CHECK_IN, "CHECKED_IN", null, ready)
    }

    fun checkOut(
        id: Int,
        expected: Long,
        acknowledge: Boolean,
        reason: String?,
        key: String,
    ): OperationResult {
        val (room, booking) = locked(id, expected)
        phase(booking, StayPhase.CHECKED_IN)
        val now = time.now()
        if (time.date(now) != booking.endDate)
            conflict(
                "CHECK_OUT_DATE",
                "Accept a date change before recording an early or late departure.",
            )
        if (now < booking.checkedInAt)
            conflict("INVALID_OPERATION_TIME", "Departure cannot precede arrival.")
        val balance = ledger.position(booking)
        if (
            !acknowledge &&
                (balance.outstandingCents == null ||
                    balance.outstandingCents != 0L ||
                    balance.creditCents != 0L)
        )
            conflict(
                "SETTLEMENT_REVIEW_REQUIRED",
                "Review and acknowledge the outstanding balance or credit before departure. No payment or refund is automatic.",
            )
        booking.phase = StayPhase.CHECKED_OUT
        booking.checkedOutAt = now
        val dirty = readiness.dirty(room, key, id)
        return save(booking, key, OperationKind.CHECK_OUT, "CHECKED_OUT", reason, dirty)
    }

    fun noShow(id: Int, expected: Long, reason: String, key: String): OperationResult {
        val (_, booking) = locked(id, expected)
        phase(booking, StayPhase.CONFIRMED)
        if (time.date(time.now()) <= booking.startDate)
            conflict("NO_SHOW_DATE", "Record a no-show only after the arrival day has passed.")
        booking.phase = StayPhase.NO_SHOW
        booking.status = ReservationStatus.CANCELLED
        return save(booking, key, OperationKind.NO_SHOW, "NO_SHOW", reason)
    }

    fun correct(
        id: Int,
        expected: Long,
        arrival: Instant,
        departure: Instant?,
        reason: String,
        key: String,
    ): OperationResult {
        val (_, booking) = locked(id, expected)
        if (booking.phase !in setOf(StayPhase.CHECKED_IN, StayPhase.CHECKED_OUT))
            conflict(
                "INVALID_STAY_TRANSITION",
                "Correct actual times only on an in-house or completed stay.",
            )
        val now = time.now()
        val day = time.date(arrival)
        if (arrival > now || day < booking.startDate!! || day >= booking.endDate!!)
            invalid(
                "INVALID_OPERATION_TIME",
                "The arrival time must be within the booked dates and no later than now.",
            )
        if (booking.phase == StayPhase.CHECKED_IN && departure != null)
            invalid("INVALID_OPERATION_TIME", "An in-house stay has no recorded departure.")
        if (
            booking.phase == StayPhase.CHECKED_OUT &&
                (departure == null ||
                    departure < arrival ||
                    departure > now ||
                    time.date(departure) != booking.endDate)
        )
            invalid(
                "INVALID_OPERATION_TIME",
                "A completed departure must follow arrival, fall on the booked departure date and be no later than now.",
            )
        if (booking.checkedInAt == arrival && booking.checkedOutAt == departure)
            return OperationResult(
                key,
                OperationKind.CORRECT_STAY,
                id,
                reservation = booking.toReservationInfo(),
            )
        booking.checkedInAt = arrival
        booking.checkedOutAt = departure
        return save(booking, key, OperationKind.CORRECT_STAY, "CORRECTED", reason)
    }

    private fun save(
        booking: Reservation,
        key: String,
        kind: OperationKind,
        eventKind: String,
        reason: String?,
        ready: ReadinessView? = null,
    ): OperationResult {
        reservations.saveAndFlush(booking)
        val event = inventory.reservationEvent(booking, key, eventKind, reason = reason)
        return OperationResult(
            key,
            kind,
            booking.id!!,
            reservation = booking.toReservationInfo(),
            readiness = ready,
            inventoryEvent = event,
        )
    }
}
