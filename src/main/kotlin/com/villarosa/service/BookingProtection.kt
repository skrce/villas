package com.villarosa.service

import com.villarosa.exception.DomainException
import java.time.Clock
import java.time.LocalDate
import java.time.ZoneId
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional

@Component
@Transactional(propagation = Propagation.MANDATORY)
class BookingProtection(private val jdbc: JdbcTemplate, private val clock: Clock) {
    fun guestArchive(id: Int) =
        reject(
            "customer_id=?",
            listOf(id),
            "GUEST_HAS_BOOKINGS",
            "Cancel this guest's current and future reservations before archiving.",
        )

    fun roomChange(id: Int, capacity: Int, active: Boolean) =
        reject(
            if (active) "room_id=? AND guest_count>?" else "room_id=?",
            if (active) listOf(id, capacity) else listOf(id),
            if (active) "CAPACITY_CONFLICT" else "ROOM_HAS_BOOKINGS",
            if (active) "Move or adjust the listed reservations before reducing capacity."
            else "Move or cancel the listed reservations before archiving this room.",
        )

    private fun reject(filter: String, values: List<Int>, code: String, message: String) {
        val ids =
            jdbc.query(
                "SELECT id FROM reservations WHERE property_id=? AND status='ACTIVE' AND (end_date>? OR stay_phase='CHECKED_IN') AND $filter ORDER BY start_date,id LIMIT 21",
                { row, _ -> row.getInt("id") },
                PropertyScope.ID,
                LocalDate.now(clock.withZone(ZoneId.of("Europe/Skopje"))),
                *values.toTypedArray(),
            )
        if (ids.isNotEmpty())
            throw DomainException(code, HttpStatus.CONFLICT, message, ids.take(20), ids.size > 20)
    }
}
