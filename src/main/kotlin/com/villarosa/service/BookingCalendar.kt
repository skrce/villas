package com.villarosa.service

import com.villarosa.exception.conflict
import com.villarosa.exception.invalid
import com.villarosa.security.BusinessScope
import com.villarosa.security.CurrentStaff
import com.villarosa.security.StaffAccess
import io.swagger.v3.oas.annotations.media.Schema
import java.sql.Date
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional

data class CalendarRoom(
    val id: Int,
    val name: String,
    val reference: String,
    val capacity: Int,
    val active: Boolean,
)

data class CalendarStay(
    val id: Int,
    val roomId: Int,
    val customerId: Int,
    val guestName: String,
    val startDate: String,
    val endDate: String,
    val guestCount: Int,
    val version: Long,
    val status: String = "ACTIVE",
    val allocationId: String = "reservation:$id",
    val phase: String = "CONFIRMED",
)

data class CalendarMaintenance(
    val id: Int,
    val roomId: Int,
    val startDate: String,
    val endDate: String,
    val reason: String,
    val version: Long,
    val status: String = "ACTIVE",
)

data class BookingCalendarPage(
    val startDate: String,
    val endDate: String,
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val rooms: List<CalendarRoom>,
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val stays: List<CalendarStay>,
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED)
    val maintenance: List<CalendarMaintenance>,
    val nextRoomCursor: Int?,
)

@Repository
class CalendarStore(private val jdbc: JdbcTemplate) {
    fun rooms(after: Int, limit: Int, archived: Boolean): List<CalendarRoom> =
        jdbc.query(
            "SELECT id,name,reference,capacity,active FROM apartments WHERE property_id=? AND id>? AND (?=TRUE OR active=TRUE) ORDER BY id LIMIT ?",
            { r, _ ->
                CalendarRoom(
                    r.getInt("id"),
                    r.getString("name"),
                    r.getString("reference"),
                    r.getInt("capacity"),
                    r.getBoolean("active"),
                )
            },
            BusinessScope.id(),
            after,
            archived,
            limit + 1,
        )

    fun stays(ids: List<Int>, dates: StayDates): List<CalendarStay> =
        jdbc.query(
            "SELECT r.id,a.room_id,r.customer_id,c.first_name,c.last_name,a.start_date,a.end_date,r.guest_count,r.version,a.allocation_id,r.stay_phase FROM reservations r JOIN (${RoomAllocations.SQL}) a ON a.property_id=r.property_id AND a.reservation_id=r.id LEFT JOIN customers c ON c.property_id=r.property_id AND c.id=r.customer_id WHERE r.property_id=? AND r.status='ACTIVE' AND a.start_date<? AND a.end_date>? AND a.room_id IN (${ids.joinToString(",") { "?" }}) ORDER BY a.room_id,a.start_date,r.id,a.allocation_id LIMIT ?",
            { r, _ ->
                CalendarStay(
                    r.getInt("id"),
                    r.getInt("room_id"),
                    r.getInt("customer_id"),
                    listOfNotNull(r.getString("first_name"), r.getString("last_name"))
                        .joinToString(" ")
                        .trim()
                        .ifEmpty { "Guest details unavailable" },
                    r.getDate("start_date").toLocalDate().toString(),
                    r.getDate("end_date").toLocalDate().toString(),
                    r.getInt("guest_count"),
                    r.getLong("version"),
                    allocationId = r.getString("allocation_id"),
                    phase = r.getString("stay_phase"),
                )
            },
            *(listOf(
                    BusinessScope.id(),
                    Date.valueOf(dates.end),
                    Date.valueOf(dates.start),
                ) + ids + listOf(MAX_EVENTS + 1))
                .toTypedArray(),
        )

    fun maintenance(ids: List<Int>, dates: StayDates): List<CalendarMaintenance> =
        jdbc.query(
            "SELECT id,room_id,start_date,end_date,reason,version FROM maintenance_blocks WHERE property_id=? AND status='ACTIVE' AND start_date<? AND end_date>? AND room_id IN (${ids.joinToString(",") { "?" }}) ORDER BY room_id,start_date,id LIMIT ?",
            { r, _ ->
                CalendarMaintenance(
                    r.getInt("id"),
                    r.getInt("room_id"),
                    r.getDate("start_date").toLocalDate().toString(),
                    r.getDate("end_date").toLocalDate().toString(),
                    r.getString("reason"),
                    r.getLong("version"),
                )
            },
            *(listOf(
                    BusinessScope.id(),
                    Date.valueOf(dates.end),
                    Date.valueOf(dates.start),
                ) + ids + listOf(MAX_EVENTS + 1))
                .toTypedArray(),
        )

    companion object {
        const val MAX_EVENTS = 2000
    }
}

@Service
class BookingCalendar(
    private val store: CalendarStore,
    private val current: CurrentStaff,
    private val access: StaffAccess,
) {
    @Transactional(
        readOnly = true,
        isolation = Isolation.REPEATABLE_READ,
        propagation = Propagation.REQUIRES_NEW,
    )
    fun read(
        start: String,
        end: String,
        after: Int,
        limit: Int,
        archived: Boolean,
    ): BookingCalendarPage {
        access.current(current.identity())
        val dates = StayDates.parse(start, end)
        if (dates.nights > 31)
            invalid("INVALID_QUERY_WINDOW", "A room calendar may span at most 31 nights.")
        if (after < 0) invalid("INVALID_CURSOR", "Room cursor must not be negative.")
        if (limit !in 1..50) invalid("INVALID_PAGE_SIZE", "Calendar pages contain 1 to 50 rooms.")
        val rows = store.rooms(after, limit, archived)
        val rooms = rows.take(limit)
        if (rooms.isEmpty())
            return BookingCalendarPage(start, end, rooms, emptyList(), emptyList(), null)
        val ids = rooms.map { it.id }
        val stays = store.stays(ids, dates)
        val maintenance = store.maintenance(ids, dates)
        if (stays.size > CalendarStore.MAX_EVENTS || maintenance.size > CalendarStore.MAX_EVENTS)
            conflict(
                "CALENDAR_INCOMPLETE",
                "This calendar contains too many inventory records. Use the reservation and room lists to review them.",
            )
        return BookingCalendarPage(
            start,
            end,
            rooms,
            stays,
            maintenance,
            if (rows.size > limit) rooms.last().id else null,
        )
    }
}
