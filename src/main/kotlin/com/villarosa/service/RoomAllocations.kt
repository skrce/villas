package com.villarosa.service

import com.villarosa.exception.conflict
import com.villarosa.exception.invalid
import com.villarosa.exception.missing
import com.villarosa.repository.ReservationRepository
import com.villarosa.repository.model.Reservation
import com.villarosa.repository.model.StayPhase
import com.villarosa.security.CurrentStaff
import com.villarosa.security.StaffAccess
import jakarta.persistence.*
import java.time.LocalDate
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional

@Entity
@Table(name = "reservation_allocations")
class ReservationAllocation(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) val id: Long? = null,
    @Column(name = "property_id", nullable = false, length = 64)
    val propertyId: String = PropertyScope.ID,
    @Column(name = "reservation_id", nullable = false) val reservationId: Int = 0,
    @Column(name = "room_id", nullable = false) val roomId: Int = 0,
    @Column(name = "start_date", nullable = false) val startDate: LocalDate = LocalDate.MIN,
    @Column(name = "end_date", nullable = false) val endDate: LocalDate = LocalDate.MIN,
)

data class RoomNightAllocation(val roomId: Int, val start: LocalDate, val end: LocalDate)

data class RoomAllocationInfo(
    val id: String,
    val roomId: Int,
    val roomName: String,
    val roomReference: String,
    val startDate: String,
    val endDate: String,
)

data class RoomAllocationPage(
    val reservationId: Int,
    val reservationVersion: Long,
    val items: List<RoomAllocationInfo>,
    val nextCursor: String?,
)

@Service
class RoomAllocations(
    private val jdbc: JdbcTemplate,
    private val reservations: ReservationRepository,
    private val current: CurrentStaff,
    private val access: StaffAccess,
) {
    @Transactional(propagation = Propagation.MANDATORY, readOnly = true)
    fun read(booking: Reservation): List<RoomNightAllocation> {
        val rows =
            jdbc.query(
                "SELECT room_id,start_date,end_date FROM reservation_allocations WHERE property_id=? AND reservation_id=? ORDER BY start_date,id",
                { row, _ ->
                    RoomNightAllocation(
                        row.getInt(1),
                        row.getDate(2).toLocalDate(),
                        row.getDate(3).toLocalDate(),
                    )
                },
                PropertyScope.ID,
                booking.id,
            )
        return rows.ifEmpty {
            listOf(RoomNightAllocation(booking.roomId!!, booking.startDate!!, booking.endDate!!))
        }
    }

    @Transactional(propagation = Propagation.MANDATORY, readOnly = true)
    fun rooms(booking: Reservation) = read(booking).map { it.roomId }.toSet() + booking.roomId!!

    fun moved(booking: Reservation, destination: Int, today: LocalDate): List<RoomNightAllocation> {
        if (booking.phase != StayPhase.CHECKED_IN)
            return listOf(RoomNightAllocation(destination, booking.startDate!!, booking.endDate!!))
        if (today > booking.endDate)
            conflict(
                "DEPARTURE_DATE_PASSED",
                "Accept a departure-date change before moving an overdue stay.",
            )
        return compact(
            read(booking).map { it.copy(end = minOf(it.end, today)) }.filter { it.start < it.end } +
                if (today < booking.endDate)
                    listOf(RoomNightAllocation(destination, today, booking.endDate!!))
                else emptyList()
        )
    }

    fun changed(booking: Reservation, dates: StayDates): List<RoomNightAllocation> {
        if (booking.phase != StayPhase.CHECKED_IN)
            return listOf(RoomNightAllocation(booking.roomId!!, dates.start, dates.end))
        val old = read(booking)
        val timeline =
            java.util.TreeMap<LocalDate, Int>().apply {
                putAll(old.associate { it.start to it.roomId })
            }
        booking.roomFromDate?.let { timeline[it] = booking.roomId!! }
        val boundaries =
            (listOf(dates.start, dates.end) +
                    timeline.keys.filter { it > dates.start && it < dates.end })
                .distinct()
                .sorted()
        return compact(
            boundaries.zipWithNext().map { (from, to) ->
                RoomNightAllocation(
                    timeline.floorEntry(from)?.value ?: old.first().roomId,
                    from,
                    to,
                )
            }
        )
    }

    @Transactional(propagation = Propagation.MANDATORY)
    fun replace(booking: Reservation, rows: List<RoomNightAllocation>) {
        val planned = compact(rows)
        check(
            planned.isNotEmpty() &&
                planned.first().start == booking.startDate &&
                planned.last().end == booking.endDate &&
                planned.all { it.start < it.end } &&
                planned.zipWithNext().all { (left, right) -> left.end == right.start }
        ) {
            "Room allocations must cover the complete booked stay."
        }
        jdbc.update(
            "DELETE FROM reservation_allocations WHERE property_id=? AND reservation_id=?",
            PropertyScope.ID,
            booking.id,
        )
        for (row in planned) jdbc.update(
            "INSERT INTO reservation_allocations(property_id,reservation_id,room_id,start_date,end_date) VALUES(?,?,?,?,?)",
            PropertyScope.ID,
            booking.id,
            row.roomId,
            row.start,
            row.end,
        )
    }

    private fun compact(rows: List<RoomNightAllocation>): List<RoomNightAllocation> {
        val result = mutableListOf<RoomNightAllocation>()
        for (row in rows.sortedBy { it.start }) {
            val previous = result.lastOrNull()
            if (previous != null && previous.roomId == row.roomId && previous.end == row.start)
                result[result.lastIndex] = previous.copy(end = row.end)
            else result.add(row)
        }
        return result
    }

    @Transactional(
        readOnly = true,
        propagation = Propagation.REQUIRES_NEW,
        isolation = Isolation.REPEATABLE_READ,
    )
    fun page(id: Int, after: String, limit: Int, expected: Long?): RoomAllocationPage {
        access.current(current.identity())
        val booking =
            reservations.findByPropertyIdAndId(PropertyScope.ID, id)
                ?: missing("Reservation does not exist.")
        if (expected != null) ReadinessService.checkVersion(booking.version, expected)
        val cursor =
            after.takeIf { it.matches(Regex("0|[1-9][0-9]*")) }?.toLongOrNull()
                ?: invalid("INVALID_CURSOR", "Use a nonnegative allocation cursor.")
        if (limit !in 1..100)
            invalid("INVALID_PAGE_SIZE", "Room-allocation pages contain 1 to 100 entries.")
        val rows =
            jdbc.query(
                "SELECT a.id,a.room_id,r.name,r.reference,a.start_date,a.end_date FROM reservation_allocations a JOIN apartments r ON r.property_id=a.property_id AND r.id=a.room_id WHERE a.property_id=? AND a.reservation_id=? AND a.id>? ORDER BY a.id LIMIT ?",
                { row, _ ->
                    RoomAllocationInfo(
                        row.getLong(1).toString(),
                        row.getInt(2),
                        row.getString(3),
                        row.getString(4),
                        row.getDate(5).toLocalDate().toString(),
                        row.getDate(6).toLocalDate().toString(),
                    )
                },
                PropertyScope.ID,
                id,
                cursor,
                limit + 1,
            )
        val page = rows.take(limit)
        if (
            page.isEmpty() &&
                cursor == 0L &&
                jdbc.queryForObject(
                    "SELECT COUNT(*) FROM reservation_allocations WHERE property_id=? AND reservation_id=?",
                    Long::class.java,
                    PropertyScope.ID,
                    id,
                ) == 0L
        ) {
            val room =
                jdbc.queryForMap(
                    "SELECT name,reference FROM apartments WHERE property_id=? AND id=?",
                    PropertyScope.ID,
                    booking.roomId,
                )
            return RoomAllocationPage(
                id,
                booking.version,
                listOf(
                    RoomAllocationInfo(
                        "legacy",
                        booking.roomId!!,
                        room["name"].toString(),
                        room["reference"].toString(),
                        booking.startDate.toString(),
                        booking.endDate.toString(),
                    )
                ),
                null,
            )
        }
        return RoomAllocationPage(
            id,
            booking.version,
            page,
            if (rows.size > limit) page.last().id else null,
        )
    }

    companion object {
        const val SQL =
            """SELECT property_id,reservation_id,room_id,start_date,end_date,CONCAT('allocation:',id) AS allocation_id FROM reservation_allocations
          UNION ALL SELECT r.property_id,r.id,r.room_id,r.start_date,r.end_date,CONCAT('reservation:',r.id) AS allocation_id FROM reservations r
          WHERE NOT EXISTS(SELECT 1 FROM reservation_allocations a WHERE a.property_id=r.property_id AND a.reservation_id=r.id)"""
    }
}
