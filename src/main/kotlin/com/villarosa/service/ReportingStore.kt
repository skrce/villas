package com.villarosa.service

import com.villarosa.exception.conflict
import com.villarosa.security.BusinessScope
import java.math.BigDecimal
import java.sql.ResultSet
import java.util.Calendar
import java.util.TimeZone
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository

/** The same corrected funds and accepted-price joins serve Today and period balances. */
object ReportMoney {
    const val JOINS =
        """
        LEFT JOIN booking_quotes q ON q.property_id=r.property_id AND q.id=r.accepted_quote_id
        LEFT JOIN reservation_prices p ON p.property_id=r.property_id AND p.id=r.accepted_quote_id AND p.reservation_id=r.id
        LEFT JOIN (
          SELECT e.property_id,e.reservation_id,
            SUM(CASE WHEN e.kind='PAYMENT' THEN e.amount_cents ELSE 0 END) AS paid,
            SUM(CASE WHEN e.kind='REFUND' THEN e.amount_cents ELSE 0 END) AS refunded
          FROM ledger_entries e
          WHERE e.kind IN ('PAYMENT','REFUND') AND NOT EXISTS
            (SELECT 1 FROM ledger_entries x WHERE x.property_id=e.property_id AND x.reverses_id=e.id)
          GROUP BY e.property_id,e.reservation_id
        ) f ON f.property_id=r.property_id AND f.reservation_id=r.id
    """
    private const val CENTS = "(p.quote_json::json #>> '{price,totalCents}')"
    const val AMOUNT =
        "CASE WHEN $CENTS ~ '^[1-9][0-9]{0,15}$' THEN CAST($CENTS AS NUMERIC(65,0)) ELSE NULL END"
    const val INVALID_SOURCE =
        """r.accepted_quote_id IS NOT NULL AND (
        p.id IS NULL
        OR COALESCE(json_typeof(p.quote_json::json #> '{price,totalCents}'),'')<>'number'
        OR COALESCE($CENTS,'') !~ '^[1-9][0-9]{0,15}$'
        OR ($AMOUNT) NOT BETWEEN 1 AND 9007199254740991
        OR COALESCE(p.quote_json::json ->> 'id','')<>r.accepted_quote_id
        OR COALESCE(p.quote_json::json #>> '{price,currency}','')<>'EUR'
        OR COALESCE(p.quote_json::json ->> 'startDate','')<>CAST(r.start_date AS TEXT)
        OR COALESCE(p.quote_json::json ->> 'endDate','')<>CAST(r.end_date AS TEXT)
    )"""
    const val AGREED = "CASE WHEN p.id IS NULL THEN NULL ELSE $AMOUNT END"
    const val OWED =
        "CASE WHEN p.id IS NULL THEN NULL WHEN r.stay_phase IN ('CANCELLED','NO_SHOW') THEN 0 ELSE $AMOUNT END"
    const val RECEIVED = "(COALESCE(f.paid,0)-COALESCE(f.refunded,0))"
    const val OUTSTANDING =
        "CASE WHEN ($OWED) IS NULL THEN NULL ELSE GREATEST(0,($OWED)-$RECEIVED) END"
    const val CREDIT = "CASE WHEN ($OWED) IS NULL THEN NULL ELSE GREATEST(0,$RECEIVED-($OWED)) END"
    const val FIELDS =
        "($AGREED) AS agreed,($OWED) AS owed,($RECEIVED) AS received,($OUTSTANDING) AS outstanding,($CREDIT) AS credit"

    fun exact(value: BigDecimal): Long =
        try {
            value.longValueExact().also {
                if (it !in 0..EuroCents.MAX) incompleteMoney()
            }
        } catch (_: ArithmeticException) {
            incompleteMoney()
        }

    fun sum(values: Iterable<Long>): Long =
        exact(values.fold(BigDecimal.ZERO) { a, b -> a + b.toBigDecimal() })

    private fun incompleteMoney(): Nothing =
        conflict(
            "REPORT_AMOUNT_LIMIT",
            "The report exceeds supported exact EUR cents. Narrow the report filters.",
        )

    fun assertSource(invalid: Boolean) {
        if (invalid)
            conflict(
                "REPORT_SOURCE_INCOMPLETE",
                "Saved accepted-price data is incomplete. Review the booking records before relying on a total.",
            )
    }

    fun balance(row: ResultSet): BalanceRow {
        assertSource(row.getBoolean("invalid_source"))
        return BalanceRow(
            row.getInt("id"),
            row.getString("guest_name"),
            row.getString("stay_phase"),
            row.getDate("start_date").toLocalDate().toString(),
            row.getDate("end_date").toLocalDate().toString(),
            row.getBigDecimal("agreed")?.let(::exact),
            row.getBigDecimal("owed")?.let(::exact),
            exact(row.getBigDecimal("received")),
            row.getBigDecimal("outstanding")?.let(::exact),
            row.getBigDecimal("credit")?.let(::exact),
        )
    }
}

data class ReportWindow(val id: Int, val phase: String, val start: String, val end: String)

data class ReportBooking(val balance: BalanceRow, val quoteId: String?, val quoteJson: String?)

data class ReportAllocation(
    val reservationId: Int,
    val roomId: Int,
    val start: String,
    val end: String,
)

@Repository
class ReportingStore(private val jdbc: JdbcTemplate) {
    fun rooms(room: Int?) =
        jdbc
            .query(
                "SELECT id,name,reference,capacity,active FROM apartments WHERE property_id=? AND (CAST(? AS INTEGER) IS NULL OR id=?) ORDER BY id LIMIT ?",
                { r, _ ->
                    CalendarRoom(
                        r.getInt(1),
                        r.getString(2),
                        r.getString(3),
                        r.getInt(4),
                        r.getBoolean(5),
                    )
                },
                BusinessScope.id(),
                room,
                room,
                MAX_ROOMS + 1,
            )
            .also { bounded(it.size, MAX_ROOMS) }

    fun windows(dates: StayDates) =
        windows("r.start_date<? AND r.end_date>?", listOf<Any>(dates.end, dates.start))

    fun windowsFor(ids: List<Int>): List<ReportWindow> =
        if (ids.isEmpty()) emptyList()
        else windows("r.id IN (${ids.joinToString(",") { "?" }})", ids)

    private fun windows(predicate: String, args: List<Any>): List<ReportWindow> =
        jdbc
            .query(
                "SELECT r.id,r.stay_phase,r.start_date,r.end_date FROM reservations r WHERE r.property_id=? AND ($predicate) ORDER BY r.id LIMIT ?",
                { r, _ ->
                    ReportWindow(
                        r.getInt(1),
                        r.getString(2),
                        r.getDate(3).toLocalDate().toString(),
                        r.getDate(4).toLocalDate().toString(),
                    )
                },
                *(listOf<Any>(BusinessScope.id()) + args + listOf(MAX_BOOKINGS + 1)).toTypedArray(),
            )
            .also { bounded(it.size, MAX_BOOKINGS) }

    fun bookings(ids: List<Int>): List<ReportBooking> {
        if (ids.isEmpty()) return emptyList()
        return jdbc.query(
            "SELECT r.id,r.stay_phase,r.start_date,r.end_date,CONCAT(c.first_name,' ',c.last_name) AS guest_name,r.accepted_quote_id,p.quote_json,${ReportMoney.FIELDS},(${ReportMoney.INVALID_SOURCE}) AS invalid_source FROM reservations r JOIN customers c ON c.property_id=r.property_id AND c.id=r.customer_id ${ReportMoney.JOINS} WHERE r.property_id=? AND r.id IN (${ids.joinToString(",") { "?" }}) ORDER BY r.id",
            { r, _ ->
                ReportBooking(
                    ReportMoney.balance(r),
                    r.getString("accepted_quote_id"),
                    r.getString("quote_json"),
                )
            },
            *(listOf<Any>(BusinessScope.id()) + ids).toTypedArray(),
        )
    }

    fun bookingAllocations(bookings: List<Int>): List<ReportAllocation> {
        if (bookings.isEmpty()) return emptyList()
        return jdbc
            .query(
                "SELECT a.reservation_id,a.room_id,a.start_date,a.end_date FROM (${RoomAllocations.SQL}) a WHERE a.property_id=? AND a.reservation_id IN (${bookings.joinToString(",") { "?" }}) ORDER BY a.reservation_id,a.start_date,a.allocation_id LIMIT ?",
                { r, _ ->
                    ReportAllocation(
                        r.getInt(1),
                        r.getInt(2),
                        r.getDate(3).toLocalDate().toString(),
                        r.getDate(4).toLocalDate().toString(),
                    )
                },
                *(listOf<Any>(BusinessScope.id()) + bookings + listOf(MAX_ALLOCATIONS + 1))
                    .toTypedArray(),
            )
            .also { bounded(it.size, MAX_ALLOCATIONS) }
    }

    fun maintenance(dates: StayDates, room: Int?) =
        jdbc
            .query(
                "SELECT id,room_id,start_date,end_date,reason,version FROM maintenance_blocks WHERE property_id=? AND status='ACTIVE' AND start_date<? AND end_date>? AND (CAST(? AS INTEGER) IS NULL OR room_id=?) ORDER BY room_id,start_date,id LIMIT ?",
                { r, _ ->
                    CalendarMaintenance(
                        r.getInt(1),
                        r.getInt(2),
                        r.getDate(3).toLocalDate().toString(),
                        r.getDate(4).toLocalDate().toString(),
                        r.getString(5),
                        r.getLong(6),
                    )
                },
                BusinessScope.id(),
                dates.end,
                dates.start,
                room,
                room,
                MAX_ALLOCATIONS + 1,
            )
            .also { bounded(it.size, MAX_ALLOCATIONS) }

    fun collections(dates: StayDates) =
        jdbc
            .query(
                "SELECT e.*,CONCAT(c.first_name,' ',c.last_name) AS guest_name,x.id AS reversed_by FROM ledger_entries e JOIN reservations r ON r.property_id=e.property_id AND r.id=e.reservation_id JOIN customers c ON c.property_id=r.property_id AND c.id=r.customer_id LEFT JOIN ledger_entries x ON x.property_id=e.property_id AND x.reverses_id=e.id WHERE e.property_id=? AND e.effective_date>=? AND e.effective_date<? ORDER BY e.effective_date,e.id LIMIT ?",
                { r, _ ->
                    val kind = r.getString("kind")
                    val reversed = r.getString("reversed_by")
                    val amount = ReportMoney.exact(r.getBigDecimal("amount_cents"))
                    CollectionRow(
                        r.getLong("id").toString(),
                        r.getInt("reservation_id"),
                        r.getString("guest_name"),
                        kind,
                        r.getString("method"),
                        r.getDate("effective_date").toLocalDate().toString(),
                        r.getTimestamp(
                                "recorded_at",
                                Calendar.getInstance(TimeZone.getTimeZone("UTC")),
                            )
                            .toInstant()
                            .toString(),
                        amount,
                        r.getString("reference"),
                        r.getString("payment_id"),
                        r.getString("reverses_id"),
                        reversed,
                        if (kind == "PAYMENT" && reversed == null) amount else 0,
                        if (kind == "REFUND" && reversed == null) amount else 0,
                    )
                },
                BusinessScope.id(),
                dates.start,
                dates.end,
                MAX_ENTRIES + 1,
            )
            .also { bounded(it.size, MAX_ENTRIES) }

    companion object {
        const val MAX_ROOMS = 500
        const val MAX_BOOKINGS = 2000
        const val MAX_ALLOCATIONS = 10000
        const val MAX_ENTRIES = 5000

        fun bounded(size: Int, max: Int) {
            if (size > max)
                conflict(
                    "REPORT_TOO_LARGE",
                    "The complete report exceeds its record limit. Use a shorter period, or a room filter if the room roster is too large. Coverage and entry limits apply before room filtering. No partial report was returned.",
                )
        }
    }
}
