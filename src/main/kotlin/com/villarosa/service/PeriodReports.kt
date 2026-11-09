package com.villarosa.service

import com.villarosa.exception.conflict
import com.villarosa.exception.invalid
import com.villarosa.exception.missing
import com.villarosa.security.BusinessScope
import com.villarosa.security.CurrentStaff
import com.villarosa.security.StaffAccess
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.ObjectMapper

@Service
class PeriodReports(
    private val store: ReportingStore,
    private val current: CurrentStaff,
    private val access: StaffAccess,
    private val time: PropertyTime,
    private val json: ObjectMapper,
) {
    @Transactional(
        readOnly = true,
        propagation = Propagation.REQUIRES_NEW,
        isolation = Isolation.REPEATABLE_READ,
    )
    fun read(kind: ReportKind, start: String, end: String, room: Int?): PeriodReport =
        snapshot(kind, start, end, room)

    @Transactional(
        readOnly = true,
        propagation = Propagation.REQUIRES_NEW,
        isolation = Isolation.REPEATABLE_READ,
    )
    fun csv(kind: ReportKind, start: String, end: String, room: Int?, expected: String): ByteArray {
        val report = snapshot(kind, start, end, room)
        if (expected != report.snapshotId)
            conflict(
                "REPORT_CHANGED",
                "Saved records changed since this report was loaded. Refresh it before downloading.",
            )
        return ReportCsv.encode(report)
    }

    private fun snapshot(kind: ReportKind, start: String, end: String, room: Int?): PeriodReport {
        access.current(current.identity())
        val dates = StayDates.parse(start, end)
        if (dates.nights > 366)
            invalid("INVALID_QUERY_WINDOW", "A report may span at most 366 property nights.")
        if (room != null && room <= 0) invalid("INVALID_ROOM", "Choose a positive room ID.")
        val rooms = store.rooms(room)
        if (room != null && rooms.isEmpty()) missing("Room does not exist.")
        val notices = mutableListOf<String>()
        if (rooms.isEmpty()) notices.add("NO_ROOMS")
        if (rooms.none { it.active }) notices.add("NO_ACTIVE_ROOMS")
        var result =
            PeriodReport(
                kind,
                start,
                end,
                time.today().toString(),
                room,
                "",
                ReportTotals(),
                emptyList(),
                emptyList(),
                emptyList(),
                emptyList(),
                notices,
            )
        if (kind == ReportKind.COLLECTIONS) {
            val sourceEntries = store.collections(dates)
            val entries =
                if (room == null) sourceEntries
                else {
                    val windows =
                        store.windowsFor(sourceEntries.map { it.reservationId }.distinct())
                    val selected =
                        validatedAllocations(windows)
                            .filter { it.roomId == room }
                            .map { it.reservationId }
                            .toSet()
                    sourceEntries.filter { it.reservationId in selected }
                }
            val paid = ReportMoney.sum(entries.map { it.collectedCents })
            val refunded = ReportMoney.sum(entries.map { it.refundedCents })
            result =
                result.copy(
                    collections = entries,
                    totals =
                        ReportTotals(
                            collectedCents = paid,
                            refundedCents = refunded,
                            netCollectedCents = paid - refunded,
                        ),
                )
        } else {
            val windows = store.windows(dates)
            val assignments =
                validatedAllocations(windows).filter {
                    it.start < end && it.end > start && (room == null || it.roomId == room)
                }
            val selected = assignments.map { it.reservationId }.toSet()
            val bookings =
                if (kind == ReportKind.OCCUPANCY) emptyList()
                else store.bookings(selected.toList().sorted())
            when (kind) {
                ReportKind.OCCUPANCY -> {
                    notices.add("CURRENT_INVENTORY_BASIS")
                    val allocations = assignments
                    val blocks = store.maintenance(dates, room)
                    val eligible =
                        windows
                            .filter { it.phase !in setOf("CANCELLED", "NO_SHOW") }
                            .map { it.id }
                            .toSet()
                    val occupancy = rooms.map { r ->
                        val blocked =
                            blocks
                                .filter { it.roomId == r.id }
                                .flatMap { nights(it.startDate, it.endDate, dates) }
                                .toSet()
                        val booked =
                            allocations
                                .filter { it.roomId == r.id && it.reservationId in eligible }
                                .flatMap { nights(it.start, it.end, dates) }
                        if (booked.size != booked.toSet().size || booked.any { it in blocked })
                            notices.add("INVENTORY_CONFLICT")
                        OccupancyRow(
                            r.id,
                            r.name,
                            r.reference,
                            r.active,
                            if (r.active) dates.nights else 0,
                            if (r.active) blocked.size.toLong() else 0,
                            if (r.active) dates.nights - blocked.size else 0,
                            booked.toSet().size.toLong(),
                        )
                    }
                    val active = occupancy.filter { it.active }
                    result =
                        result.copy(
                            occupancy = occupancy,
                            totals =
                                ReportTotals(
                                    roomNights = active.sumOf { it.roomNights },
                                    blockedNights = active.sumOf { it.blockedNights },
                                    sellableNights = active.sumOf { it.sellableNights },
                                    bookedNights = active.sumOf { it.bookedNights },
                                ),
                        )
                }
                ReportKind.CHARGES -> {
                    val byId = bookings.associateBy { it.balance.reservationId }
                    val byRoom = rooms.associateBy { it.id }
                    val prices = bookings.associate { it.balance.reservationId to price(it) }
                    val charges = assignments.map { a ->
                        val b = byId[a.reservationId] ?: incomplete()
                        val r = byRoom[a.roomId] ?: incomplete()
                        val from = maxOf(start, a.start)
                        val to = minOf(end, a.end)
                        val price = prices[a.reservationId]
                        val amount =
                            if (price == null) null
                            else if (b.balance.phase in setOf("CANCELLED", "NO_SHOW")) 0L
                            else
                                ReportMoney.sum(
                                    price.lines.map { line ->
                                        val count = overlap(line.startDate, line.endDate, from, to)
                                        if (count == 0L) 0L
                                        else EuroCents.multiply(line.nightlyCents, count)
                                    }
                                )
                        ChargeRow(
                            a.reservationId,
                            a.roomId,
                            r.name,
                            r.reference,
                            b.balance.guestName,
                            b.balance.phase,
                            from,
                            to,
                            overlap(from, to, from, to),
                            b.quoteId,
                            amount,
                        )
                    }
                    val unknown =
                        charges
                            .filter { it.chargeCents == null }
                            .map { it.reservationId }
                            .distinct()
                            .size
                    val known = ReportMoney.sum(charges.mapNotNull { it.chargeCents })
                    if (unknown > 0) notices.add("UNKNOWN_PRICES")
                    result =
                        result.copy(
                            charges = charges,
                            totals =
                                ReportTotals(
                                    knownChargeCents = known,
                                    chargeCents = known.takeIf { unknown == 0 },
                                    unknownPriceCount = unknown,
                                ),
                        )
                }
                ReportKind.BALANCES -> {
                    val balances = bookings.map { it.balance }
                    val unknown = balances.count { it.outstandingCents == null }
                    val outstanding = ReportMoney.sum(balances.mapNotNull { it.outstandingCents })
                    val credit = ReportMoney.sum(balances.mapNotNull { it.creditCents })
                    if (unknown > 0) notices.add("UNKNOWN_PRICES")
                    result =
                        result.copy(
                            balances = balances,
                            totals =
                                ReportTotals(
                                    knownOutstandingCents = outstanding,
                                    outstandingCents = outstanding.takeIf { unknown == 0 },
                                    knownCreditCents = credit,
                                    creditCents = credit.takeIf { unknown == 0 },
                                    unknownPriceCount = unknown,
                                ),
                        )
                }
                else -> error("Collections handled separately.")
            }
        }
        val normalized = result.copy(notices = notices.distinct())
        val digest =
            MessageDigest.getInstance("SHA-256")
                .digest(json.writeValueAsBytes(listOf(BusinessScope.id(), normalized)))
                .joinToString("") { "%02x".format(it) }
        return normalized.copy(snapshotId = digest)
    }

    private fun validatedAllocations(windows: List<ReportWindow>): List<ReportAllocation> {
        val rows = store.bookingAllocations(windows.map { it.id })
        val grouped = rows.groupBy { it.reservationId }
        for (window in windows) {
            val parts = grouped[window.id].orEmpty().sortedBy { it.start }
            if (
                parts.isEmpty() ||
                    parts.first().start != window.start ||
                    parts.last().end != window.end ||
                    parts.any { it.start >= it.end } ||
                    parts.zipWithNext().any { (a, b) -> a.end != b.start }
            )
                incomplete()
        }
        return rows
    }

    private fun price(booking: ReportBooking): StayPrice? {
        if (booking.quoteJson == null) {
            if (booking.quoteId != null) incomplete()
            return null
        }
        val quote =
            try {
                json.readValue(booking.quoteJson, BookingQuote::class.java)
            } catch (_: Exception) {
                incomplete()
            }
        val b = booking.balance
        if (
            quote.id != booking.quoteId ||
                quote.startDate != b.startDate ||
                quote.endDate != b.endDate ||
                quote.price.currency != "EUR" ||
                quote.price.totalCents != b.agreedCents
        )
            incomplete()
        val lines = quote.price.lines
        if (
            lines.isEmpty() ||
                lines.first().startDate != b.startDate ||
                lines.last().endDate != b.endDate ||
                lines.zipWithNext().any { (a, c) -> a.endDate != c.startDate }
        )
            incomplete()
        for (line in lines) {
            val count = overlap(line.startDate, line.endDate, line.startDate, line.endDate)
            if (
                count <= 0 ||
                    line.nights != count ||
                    line.nightlyCents !in 1..EuroCents.MAX ||
                    count > EuroCents.MAX / line.nightlyCents ||
                    line.subtotalCents != line.nightlyCents * count
            )
                incomplete()
        }
        if (ReportMoney.sum(lines.map { it.subtotalCents }) != b.agreedCents) incomplete()
        return quote.price
    }

    private fun nights(start: String, end: String, dates: StayDates): List<LocalDate> =
        maxOf(LocalDate.parse(start), dates.start)
            .datesUntil(minOf(LocalDate.parse(end), dates.end))
            .toList()

    private fun overlap(a: String, b: String, start: String, end: String): Long =
        maxOf(
            0,
            ChronoUnit.DAYS.between(
                LocalDate.parse(maxOf(a, start)),
                LocalDate.parse(minOf(b, end)),
            ),
        )

    private fun incomplete(): Nothing =
        conflict(
            "REPORT_SOURCE_INCOMPLETE",
            "Saved report source data is incomplete. Review the affected booking records before relying on a total.",
        )
}

object ReportCsv {
    const val MAX_BYTES = 5 * 1024 * 1024

    fun encode(report: PeriodReport): ByteArray {
        val common =
            listOf(
                "report",
                "period_start_inclusive",
                "period_end_exclusive",
                "property_date",
                "snapshot_id",
                "currency",
                "notices",
            )
        val prefix =
            listOf(
                report.kind.name,
                report.startDate,
                report.endDate,
                report.propertyDate,
                report.snapshotId,
                "EUR",
                report.notices.joinToString(";"),
            )
        val (columns, rows) =
            when (report.kind) {
                ReportKind.OCCUPANCY ->
                    listOf(
                        "room_id",
                        "room_name",
                        "room_reference",
                        "currently_active",
                        "room_nights_current_roster",
                        "blocked_nights",
                        "sellable_nights",
                        "booked_nights",
                    ) to
                        report.occupancy.map {
                            listOf(
                                it.roomId,
                                it.roomName,
                                it.roomReference,
                                it.active,
                                it.roomNights,
                                it.blockedNights,
                                it.sellableNights,
                                it.bookedNights,
                            )
                        }
                ReportKind.CHARGES ->
                    listOf(
                        "booking_id",
                        "room_id",
                        "room_name",
                        "room_reference",
                        "guest_name",
                        "phase",
                        "night_start",
                        "night_end_exclusive",
                        "nights",
                        "accepted_quote_id",
                        "charge_cents",
                    ) to
                        report.charges.map {
                            listOf(
                                it.reservationId,
                                it.roomId,
                                it.roomName,
                                it.roomReference,
                                it.guestName,
                                it.phase,
                                it.startDate,
                                it.endDate,
                                it.nights,
                                it.quoteId,
                                it.chargeCents,
                            )
                        }
                ReportKind.COLLECTIONS ->
                    listOf(
                        "entry_id",
                        "booking_id",
                        "guest_name",
                        "kind",
                        "method",
                        "effective_date",
                        "recorded_at_utc",
                        "amount_cents",
                        "reference",
                        "payment_id",
                        "reverses_id",
                        "reversed_by_id",
                        "corrected_collected_cents",
                        "corrected_refunded_cents",
                    ) to
                        report.collections.map {
                            listOf(
                                it.entryId,
                                it.reservationId,
                                it.guestName,
                                it.kind,
                                it.method,
                                it.effectiveDate,
                                it.recordedAt,
                                it.amountCents,
                                it.reference,
                                it.paymentId,
                                it.reversesId,
                                it.reversedById,
                                it.collectedCents,
                                it.refundedCents,
                            )
                        }
                ReportKind.BALANCES ->
                    listOf(
                        "booking_id",
                        "guest_name",
                        "phase",
                        "stay_start",
                        "stay_end_exclusive",
                        "agreed_cents",
                        "accommodation_cents",
                        "net_received_cents",
                        "outstanding_cents",
                        "credit_cents",
                    ) to
                        report.balances.map {
                            listOf(
                                it.reservationId,
                                it.guestName,
                                it.phase,
                                it.startDate,
                                it.endDate,
                                it.agreedCents,
                                it.accommodationCents,
                                it.receivedCents,
                                it.outstandingCents,
                                it.creditCents,
                            )
                        }
            }
        val csv = buildString {
            append('\uFEFF')
            append((listOf("record_type") + common + columns).joinToString(",", transform = ::cell))
                .append("\r\n")
            append(
                    (listOf("METADATA") + prefix + List(columns.size) { "" }).joinToString(
                        ",",
                        transform = ::cell,
                    )
                )
                .append("\r\n")
            for (row in rows) append(
                    (listOf("DATA") + prefix + row.map { it?.toString() ?: "UNKNOWN" })
                        .joinToString(
                            ",",
                            transform = ::cell,
                        )
                )
                .append("\r\n")
        }
            .toByteArray(StandardCharsets.UTF_8)
        if (csv.size > MAX_BYTES)
            conflict(
                "EXPORT_TOO_LARGE",
                "The complete CSV exceeds 5 MiB. Narrow the report filters; no partial download was returned.",
            )
        return csv
    }

    fun cell(value: String): String {
        val significant = value.dropWhile {
            it.isWhitespace() || it.isISOControl() || it == '\uFEFF'
        }
        val safe =
            if (
                significant.firstOrNull() in listOf('=', '+', '-', '@') ||
                    value.firstOrNull() in listOf('\t', '\r', '\n') ||
                    value.matches(Regex("[0-9]{16,}|0[0-9]+|[0-9]+(?:\\.[0-9]+)?[eE][+-]?[0-9]+"))
            )
                "'$value"
            else value
        return "\"${safe.replace("\"","\"\"")}\""
    }
}
