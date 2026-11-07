package com.villarosa.service

import com.villarosa.exception.conflict
import com.villarosa.exception.invalid
import com.villarosa.repository.model.*
import com.villarosa.security.CurrentStaff
import com.villarosa.security.StaffAccess
import io.swagger.v3.oas.annotations.media.Schema
import java.sql.ResultSet
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.util.Calendar
import java.util.TimeZone
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional

enum class FrontDeskList {
    ARRIVALS,
    DEPARTURES,
    IN_HOUSE,
    ATTENTION,
}

data class FrontDeskStay(
    val reservation: ReservationInfo,
    val roomName: String,
    val roomReference: String,
    val guestName: String,
)

data class FrontDeskPage(
    val propertyDate: String,
    val list: FrontDeskList,
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val items: List<FrontDeskStay>,
    val nextCursor: Int?,
)

data class HousekeepingRoom(
    val roomId: Int,
    val name: String,
    val reference: String,
    val occupied: Boolean,
    val readiness: ReadinessView,
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED)
    val maintenance: List<CalendarMaintenance>,
)

data class HousekeepingPage(
    val propertyDate: String,
    val maintenanceUntil: String,
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val rooms: List<HousekeepingRoom>,
    val nextCursor: Int?,
)

@Service
class DailyOperations(
    private val jdbc: JdbcTemplate,
    private val calendar: CalendarStore,
    private val current: CurrentStaff,
    private val access: StaffAccess,
    private val time: PropertyTime,
) {
    @Transactional(
        readOnly = true,
        propagation = Propagation.REQUIRES_NEW,
        isolation = Isolation.REPEATABLE_READ,
    )
    fun desk(list: FrontDeskList, after: Int, limit: Int, expectedDate: String?): FrontDeskPage {
        val today = context(after, limit, expectedDate)
        val predicate =
            when (list) {
                FrontDeskList.ARRIVALS ->
                    "r.stay_phase IN ('CONFIRMED','CHECKED_IN') AND r.start_date=?"
                FrontDeskList.DEPARTURES ->
                    "r.stay_phase IN ('CONFIRMED','CHECKED_IN','CHECKED_OUT') AND r.end_date=?"
                FrontDeskList.IN_HOUSE -> "r.stay_phase='CHECKED_IN'"
                FrontDeskList.ATTENTION ->
                    "((r.stay_phase='CONFIRMED' AND r.start_date<?) OR (r.stay_phase='CHECKED_IN' AND r.end_date<?))"
            }
        val dates: List<Any> =
            when (list) {
                FrontDeskList.IN_HOUSE -> emptyList()
                FrontDeskList.ATTENTION -> listOf(today, today)
                else -> listOf(today)
            }
        val rows =
            jdbc.query(
                "SELECT r.*,a.name AS room_name,a.reference AS room_reference,c.first_name,c.last_name FROM reservations r JOIN apartments a ON a.property_id=r.property_id AND a.id=r.room_id JOIN customers c ON c.property_id=r.property_id AND c.id=r.customer_id WHERE r.property_id=? AND r.id>? AND ($predicate) ORDER BY r.id LIMIT ?",
                { row, _ ->
                    FrontDeskStay(
                        booking(row),
                        row.getString("room_name"),
                        row.getString("room_reference"),
                        listOf(row.getString("first_name"), row.getString("last_name"))
                            .joinToString(" ")
                            .trim(),
                    )
                },
                *(listOf(PropertyScope.ID, after) + dates + listOf(limit + 1)).toTypedArray(),
            )
        return FrontDeskPage(
            today.toString(),
            list,
            rows.take(limit),
            if (rows.size > limit) rows[limit - 1].reservation.id else null,
        )
    }

    @Transactional(
        readOnly = true,
        propagation = Propagation.REQUIRES_NEW,
        isolation = Isolation.REPEATABLE_READ,
    )
    fun housekeeping(
        after: Int,
        limit: Int,
        state: ReadinessState?,
        expectedDate: String?,
    ): HousekeepingPage {
        val today = context(after, limit, expectedDate)
        val until = today.plusDays(7)
        val rows =
            jdbc.query(
                "SELECT a.id,a.name,a.reference,COALESCE(s.state,'DIRTY') AS readiness_state,COALESCE(s.version,0) AS readiness_version,s.changed_at,EXISTS(SELECT 1 FROM reservations r WHERE r.property_id=a.property_id AND r.room_id=a.id AND r.stay_phase='CHECKED_IN') AS occupied FROM apartments a LEFT JOIN room_readiness s ON s.property_id=a.property_id AND s.room_id=a.id WHERE a.property_id=? AND a.active=TRUE AND a.id>? AND (? IS NULL OR COALESCE(s.state,'DIRTY')=?) ORDER BY a.id LIMIT ?",
                { row, _ ->
                    val id = row.getInt("id")
                    HousekeepingRoom(
                        id,
                        row.getString("name"),
                        row.getString("reference"),
                        row.getBoolean("occupied"),
                        ReadinessView(
                            id,
                            ReadinessState.valueOf(row.getString("readiness_state")),
                            row.getLong("readiness_version"),
                            instant(row, "changed_at"),
                        ),
                        emptyList(),
                    )
                },
                PropertyScope.ID,
                after,
                state?.name,
                state?.name,
                limit + 1,
            )
        val rooms = rows.take(limit)
        val maintenance =
            if (rooms.isEmpty()) emptyList()
            else calendar.maintenance(rooms.map { it.roomId }, StayDates(today, until))
        if (maintenance.size > CalendarStore.MAX_EVENTS)
            conflict(
                "HOUSEKEEPING_INCOMPLETE",
                "Too many maintenance records are present. Review each room's maintenance before proceeding.",
            )
        val grouped = maintenance.groupBy { it.roomId }
        return HousekeepingPage(
            today.toString(),
            until.toString(),
            rooms.map { it.copy(maintenance = grouped[it.roomId] ?: emptyList()) },
            if (rows.size > limit) rooms.last().roomId else null,
        )
    }

    private fun context(after: Int, limit: Int, expected: String?): LocalDate {
        access.current(current.identity())
        if (after < 0) invalid("INVALID_CURSOR", "Use a nonnegative record cursor.")
        if (limit !in 1..50)
            invalid("INVALID_PAGE_SIZE", "Daily operations pages contain 1 to 50 records.")
        val today = time.today()
        if (expected != null && expected != today.toString())
            conflict(
                "PROPERTY_DATE_CHANGED",
                "The property day changed. Refresh the list before loading more records.",
            )
        return today
    }

    private fun instant(row: ResultSet, column: String) =
        row.getTimestamp(column, Calendar.getInstance(TimeZone.getTimeZone("UTC")))?.toInstant()

    private fun booking(row: ResultSet): ReservationInfo {
        val start = row.getDate("start_date").toLocalDate()
        val end = row.getDate("end_date").toLocalDate()
        return ReservationInfo(
            row.getInt("id"),
            row.getInt("customer_id"),
            row.getInt("room_id"),
            start.toString(),
            end.toString(),
            row.getInt("guest_count"),
            ReservationStatus.valueOf(row.getString("status")),
            row.getLong("version"),
            ChronoUnit.DAYS.between(start, end),
            row.getString("accepted_quote_id"),
            StayPhase.valueOf(row.getString("stay_phase")),
            instant(row, "checked_in_at")?.toString(),
            instant(row, "checked_out_at")?.toString(),
            row.getDate("room_from_date")?.toLocalDate()?.toString(),
        )
    }
}
