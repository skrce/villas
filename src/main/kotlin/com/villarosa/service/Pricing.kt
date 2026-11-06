package com.villarosa.service

import com.villarosa.exception.conflict
import com.villarosa.exception.invalid
import java.text.Normalizer
import java.time.LocalDate
import java.time.temporal.ChronoUnit

object EuroCents {
    const val MAX = 9_007_199_254_740_991L

    fun currency(value: String) {
        if (value != "EUR") invalid("UNSUPPORTED_CURRENCY", "Only EUR is supported.")
    }

    fun positive(value: Long): Long {
        if (value !in 1..MAX) invalid("INVALID_AMOUNT", "Enter a positive exact EUR-cent amount.")
        return value
    }

    fun add(left: Long, right: Long): Long {
        if (left !in 0..MAX || right !in 0..MAX)
            invalid("INVALID_AMOUNT", "Amounts must be supported non-negative EUR cents.")
        return checked { Math.addExact(left, right) }
    }

    fun multiply(amount: Long, nights: Long): Long {
        positive(amount)
        if (nights <= 0)
            invalid("INVALID_PRICE_QUANTITY", "The number of priced nights must be positive.")
        return checked { Math.multiplyExact(amount, nights) }
    }

    private fun checked(calculate: () -> Long): Long {
        val value =
            try {
                calculate()
            } catch (_: ArithmeticException) {
                invalid("AMOUNT_TOO_LARGE", "The accommodation total exceeds the supported amount.")
            }
        if (value !in 0..MAX)
            invalid("AMOUNT_TOO_LARGE", "The accommodation total exceeds the supported amount.")
        return value
    }
}

data class SeasonRate(
    val name: String,
    val startDate: String,
    val endDate: String,
    val nightlyCents: Long,
) {
    fun normalized(): SeasonRate {
        val label =
            Normalizer.normalize(name, Normalizer.Form.NFC)
                .replace(Regex("[\\p{Z}\\s]+"), " ")
                .trim()
        if (label.isEmpty() || label.length > 100 || name.any { it.isISOControl() })
            invalid("INVALID_SEASON", "Give each season a name of at most 100 characters.")
        StayDates.parse(startDate, endDate)
        EuroCents.positive(nightlyCents)
        return copy(name = label)
    }
}

data class RoomRates(
    val roomId: Int,
    val currency: String = "EUR",
    val baseNightlyCents: Long? = null,
    val version: Long = 0,
    val seasons: List<SeasonRate> = emptyList(),
)

data class PriceLine(
    val startDate: String,
    val endDate: String,
    val name: String,
    val nightlyCents: Long,
    val nights: Long,
    val subtotalCents: Long,
)

data class StayPrice(
    val currency: String = "EUR",
    val rateVersion: Long,
    val nights: Long,
    val lines: List<PriceLine>,
    val totalCents: Long,
)

object PriceCalculator {
    const val MAX_SEASONS = 200

    fun seasons(input: List<SeasonRate>): List<SeasonRate> {
        if (input.size > MAX_SEASONS)
            invalid("TOO_MANY_SEASONS", "A room supports at most 200 seasonal periods.")
        val sorted = input.map { it.normalized() }.sortedBy { it.startDate }
        if (sorted.zipWithNext().any { (left, right) -> left.endDate > right.startDate })
            conflict(
                "SEASON_OVERLAP",
                "Seasonal periods must not overlap. Adjacent periods are allowed.",
            )
        return sorted
    }

    fun calculate(rates: RoomRates, stay: StayDates): StayPrice {
        EuroCents.currency(rates.currency)
        val base =
            rates.baseNightlyCents
                ?: conflict("RATES_REQUIRED", "Configure this room's nightly rates before quoting.")
        EuroCents.positive(base)
        val rules =
            seasons(rates.seasons).filter {
                stay.overlaps(LocalDate.parse(it.startDate), LocalDate.parse(it.endDate))
            }
        val boundaries =
            (listOf(stay.start, stay.end) +
                    rules.flatMap {
                        listOf(
                            maxOf(stay.start, LocalDate.parse(it.startDate)),
                            minOf(stay.end, LocalDate.parse(it.endDate)),
                        )
                    })
                .distinct()
                .sorted()
        val lines =
            boundaries.zipWithNext().map { (start, end) ->
                val rule = rules.find {
                    start >= LocalDate.parse(it.startDate) && start < LocalDate.parse(it.endDate)
                }
                val nightly = rule?.nightlyCents ?: base
                val nights = ChronoUnit.DAYS.between(start, end)
                PriceLine(
                    start.toString(),
                    end.toString(),
                    rule?.name ?: "Base rate",
                    nightly,
                    nights,
                    EuroCents.multiply(nightly, nights),
                )
            }
        return StayPrice(
            rateVersion = rates.version,
            nights = stay.nights,
            lines = lines,
            totalCents = lines.fold(0L) { sum, line -> EuroCents.add(sum, line.subtotalCents) },
        )
    }
}
