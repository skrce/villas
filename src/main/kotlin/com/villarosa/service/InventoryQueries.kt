package com.villarosa.service

import com.villarosa.exception.invalid
import com.villarosa.exception.missing
import com.villarosa.repository.*
import com.villarosa.repository.model.*
import com.villarosa.security.CurrentStaff
import com.villarosa.security.StaffAccess
import org.springframework.data.domain.PageRequest
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
@Transactional(readOnly = true)
class InventoryQueries(
    private val reservations: ReservationRepository,
    private val blocks: MaintenanceRepository,
    private val events: InventoryEventRepository,
    private val current: CurrentStaff,
    private val access: StaffAccess,
    private val rooms: ApartmentRepository,
) {
    fun reservations(
        start: String,
        end: String,
        status: ReservationStatus?,
        after: Int,
        limit: Int,
        roomId: Int? = null,
    ): ReservationPage {
        access.current(current.identity())
        checkRoom(roomId)
        val dates = window(start, end)
        val rows =
            reservations.calendar(
                PropertyScope.ID,
                dates.start,
                dates.end,
                status,
                cursor(after),
                page(limit),
                roomId,
            )
        val items = rows.take(limit)
        return ReservationPage(
            items.map { it.toReservationInfo() },
            if (rows.size > limit) items.last().id else null,
        )
    }

    fun maintenance(
        start: String,
        end: String,
        status: ReservationStatus?,
        after: Int,
        limit: Int,
        roomId: Int? = null,
    ): MaintenancePage {
        access.current(current.identity())
        checkRoom(roomId)
        val dates = window(start, end)
        val rows =
            blocks.calendar(
                PropertyScope.ID,
                dates.start,
                dates.end,
                status,
                cursor(after),
                page(limit),
                roomId,
            )
        val items = rows.take(limit)
        return MaintenancePage(items, if (rows.size > limit) items.last().id else null)
    }

    fun reservationEvents(id: Int, after: String, limit: Int): InventoryEventPage {
        access.current(current.identity())
        if (reservations.findByPropertyIdAndId(PropertyScope.ID, id) == null)
            missing("Reservation does not exist.")
        return history(
            events.reservationHistory(PropertyScope.ID, id, eventCursor(after), page(limit)),
            limit,
        )
    }

    fun maintenanceEvents(id: Int, after: String, limit: Int): InventoryEventPage {
        access.current(current.identity())
        if (blocks.findByPropertyIdAndId(PropertyScope.ID, id) == null)
            missing("Maintenance block does not exist.")
        return history(
            events.blockHistory(PropertyScope.ID, id, eventCursor(after), page(limit)),
            limit,
        )
    }

    private fun history(rows: List<InventoryEvent>, limit: Int): InventoryEventPage {
        val items = rows.take(limit).map(InventoryEventInfo::from)
        return InventoryEventPage(items, if (rows.size > limit) items.last().id else null)
    }

    private fun window(start: String, end: String): StayDates =
        StayDates.parse(start, end).also {
            if (it.nights > MAX_WINDOW_DAYS)
                invalid(
                    "INVALID_QUERY_WINDOW",
                    "A calendar query may span at most $MAX_WINDOW_DAYS days.",
                )
        }

    private fun checkRoom(id: Int?) {
        if (id != null && rooms.findByPropertyIdAndId(PropertyScope.ID, id) == null)
            missing("Room does not exist.")
    }

    private fun cursor(after: Int): Int {
        if (after < 0) invalid("INVALID_CURSOR", "Cursor must not be negative.")
        return after
    }

    private fun eventCursor(after: String): Long {
        val value = if (after.matches(Regex("0|[1-9][0-9]*"))) after.toLongOrNull() else null
        return value?.takeIf { it >= 0 }
            ?: invalid("INVALID_CURSOR", "Event cursor must be a nonnegative integer string.")
    }

    private fun page(limit: Int): PageRequest {
        if (limit !in 1..MAX_PAGE_SIZE)
            invalid("INVALID_PAGE_SIZE", "Limit must be between 1 and $MAX_PAGE_SIZE.")
        return PageRequest.of(0, limit + 1)
    }

    companion object {
        const val MAX_PAGE_SIZE = 200
        const val MAX_WINDOW_DAYS = 366
    }
}
