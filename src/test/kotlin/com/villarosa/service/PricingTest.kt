package com.villarosa.service

import com.villarosa.exception.DomainException
import com.villarosa.exception.ExceptionHandler.ClientException
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource

class PricingTest {
    private fun price(
        start: String,
        end: String,
        seasons: List<SeasonRate> = emptyList(),
        base: Long = 1001,
    ) =
        PriceCalculator.calculate(
            RoomRates(7, baseNightlyCents = base, version = 3, seasons = seasons),
            StayDates.parse(start, end),
        )

    @Test
    fun eachNightUsesExactlyItsSeasonOrBasePriceAcrossAdjacentBoundaries() {
        val result =
            price(
                "2030-06-30",
                "2030-07-05",
                listOf(
                    SeasonRate("Summer", "2030-07-01", "2030-07-03", 2501),
                    SeasonRate("Event", "2030-07-03", "2030-07-04", 3002),
                ),
            )
        assertThat(result.lines.map { it.nights }).containsExactly(1, 2, 1, 1)
        assertThat(result.lines.map { it.nightlyCents }).containsExactly(1001, 2501, 3002, 1001)
        assertThat(result.lines.map { it.name })
            .containsExactly("Base rate", "Summer", "Event", "Base rate")
        assertThat(result.totalCents).isEqualTo(10006)
        assertThat(result.rateVersion).isEqualTo(3)
        assertThat(result.currency).isEqualTo("EUR")
    }

    @Test
    fun crossYearLeapDayAndDaylightSavingStaysCountCalendarNights() {
        assertThat(price("2028-02-28", "2028-03-01").totalCents).isEqualTo(2002)
        assertThat(price("2026-03-28", "2026-03-30").nights).isEqualTo(2)
        assertThat(price("2026-10-24", "2026-10-26").nights).isEqualTo(2)
        assertThat(
                price(
                        "2030-12-31",
                        "2031-01-02",
                        listOf(SeasonRate("New year", "2031-01-01", "2031-01-03", 1505)),
                    )
                    .totalCents
            )
            .isEqualTo(2506)
    }

    @Test
    fun seasonalRulesCanSpanNewYearAndPeriodsOutsideTheStayDoNotAddCharges() {
        val rules = listOf(SeasonRate("Winter", "2030-12-20", "2031-01-05", 5000))
        assertThat(price("2030-12-31", "2031-01-02", rules).totalCents).isEqualTo(10000)
        assertThat(price("2031-01-05", "2031-01-06", rules).totalCents).isEqualTo(1001)
        assertThat(price("2030-12-19", "2030-12-20", rules).totalCents).isEqualTo(1001)
    }

    @Test
    fun longStaysHaveBoundedRateSegmentsRatherThanMillionsOfNightRows() {
        val result = price("1000-01-01", "9999-12-31", base = 1)
        assertThat(result.lines).hasSize(1)
        assertThat(result.totalCents).isEqualTo(result.nights)
    }

    @ParameterizedTest
    @ValueSource(longs = [0, -1, 9007199254740992, Long.MAX_VALUE])
    fun invalidNightlyAmountsNeverReachCalculation(value: Long) {
        assertThat(
                assertThrows<DomainException> { price("2030-01-01", "2030-01-02", base = value) }
                    .code
            )
            .isEqualTo("INVALID_AMOUNT")
    }

    @Test
    fun exactSafeIntegerLimitsAndOverflowAreCheckedBeforeReturningMoney() {
        assertThat(price("2030-01-01", "2030-01-02", base = EuroCents.MAX).totalCents)
            .isEqualTo(EuroCents.MAX)
        assertThat(
                assertThrows<DomainException> {
                        price("2030-01-01", "2030-01-03", base = EuroCents.MAX)
                    }
                    .code
            )
            .isEqualTo("AMOUNT_TOO_LARGE")
        assertThat(
                assertThrows<DomainException> { EuroCents.multiply(EuroCents.MAX, 3_000_000) }.code
            )
            .isEqualTo("AMOUNT_TOO_LARGE")
        assertThat(
                assertThrows<DomainException> { EuroCents.multiply(EuroCents.MAX, Long.MAX_VALUE) }
                    .code
            )
            .isEqualTo("AMOUNT_TOO_LARGE")
        assertThat(assertThrows<DomainException> { EuroCents.add(EuroCents.MAX, 1) }.code)
            .isEqualTo("AMOUNT_TOO_LARGE")
        assertThat(EuroCents.add(1001, 2002)).isEqualTo(3003)
    }

    @Test
    fun unsetBaseRatesAndUnsupportedCurrencyCannotProduceAQuote() {
        val stay = StayDates.parse("2030-01-01", "2030-01-02")
        assertThat(
                assertThrows<DomainException> { PriceCalculator.calculate(RoomRates(7), stay) }.code
            )
            .isEqualTo("RATES_REQUIRED")
        for (currency in listOf("USD", "eur", "EUR ")) assertThat(
                assertThrows<DomainException> {
                        PriceCalculator.calculate(RoomRates(7, currency, 100), stay)
                    }
                    .code
            )
            .isEqualTo("UNSUPPORTED_CURRENCY")
    }

    @Test
    fun invalidOperandsCannotCancelEachOtherIntoAValidAmount() {
        for ((left, right) in
            listOf(-1L to 2L, 2L to -1L, Long.MAX_VALUE to 0L, 0L to Long.MAX_VALUE)) assertThat(
                assertThrows<DomainException> { EuroCents.add(left, right) }.code
            )
            .isEqualTo("INVALID_AMOUNT")
        for (nights in listOf(0L, -1L)) assertThat(
                assertThrows<DomainException> { EuroCents.multiply(100, nights) }.code
            )
            .isEqualTo("INVALID_PRICE_QUANTITY")
    }

    @Test
    fun seasonalNamesUseNormalizedUnicodeSpaces() {
        val rule = SeasonRate("Лето\u00a0\u2003 2028", "2028-07-01", "2028-08-01", 100)
        assertThat(rule.normalized().name).isEqualTo("Лето 2028")
    }

    @Test
    fun nestedAndPartialOverlapAreRejectedWhileUnorderedAdjacentSeasonsAreNormalized() {
        val first = SeasonRate("  Лето  ", "2030-01-01", "2030-01-05", 1200)
        for (second in
            listOf(
                first.copy(startDate = "2030-01-03"),
                first.copy(startDate = "2030-01-04", endDate = "2030-01-06"),
            )) assertThat(
                assertThrows<DomainException> { PriceCalculator.seasons(listOf(first, second)) }
                    .code
            )
            .isEqualTo("SEASON_OVERLAP")
        val next = first.copy(startDate = "2030-01-05", endDate = "2030-01-10")
        assertThat(PriceCalculator.seasons(listOf(next, first)).map { it.name })
            .containsExactly("Лето", "Лето")
        assertThat(
                assertThrows<DomainException> { PriceCalculator.seasons(List(201) { first }) }.code
            )
            .isEqualTo("TOO_MANY_SEASONS")
    }

    @ParameterizedTest
    @ValueSource(strings = ["", " ", "Synthetic\nseason"])
    fun seasonsRequireReadableSingleLineNames(name: String) {
        assertThat(
                assertThrows<DomainException> {
                        SeasonRate(name, "2030-01-01", "2030-01-02", 100).normalized()
                    }
                    .code
            )
            .isEqualTo("INVALID_SEASON")
    }

    @Test
    fun impossibleSeasonDatesAndAmountsAreRejected() {
        assertThrows<ClientException> {
            SeasonRate("Invalid", "2030-02-30", "2030-03-03", 100).normalized()
        }
        assertThrows<ClientException> {
            SeasonRate("Invalid", "2030-03-03", "2030-03-03", 100).normalized()
        }
        assertThrows<DomainException> {
            SeasonRate("Invalid", "2030-03-01", "2030-03-03", 0).normalized()
        }
        assertThrows<DomainException> {
            SeasonRate("x".repeat(101), "2030-03-01", "2030-03-03", 100).normalized()
        }
    }
}
