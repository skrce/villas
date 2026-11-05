package com.villarosa.service

import com.villarosa.exception.ExceptionHandler.ClientException
import java.time.LocalDate
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource

class StayDatesTest {
    @ParameterizedTest
    @ValueSource(
        strings =
            [
                "2026-02-30",
                "2025-02-29",
                "2026-01-01suffix",
                "2026-01-01T00:00:00Z",
                " 2026-01-01",
                "2026-1-01",
                "0999-01-01",
                "+10000-01-01",
            ]
    )
    fun rejectsImpossibleOrIncompleteDates(value: String) {
        assertThrows<ClientException> { StayDates.parse(value, "2027-01-01") }
    }

    @ParameterizedTest
    @ValueSource(strings = ["2026-11-09", "2026-11-08"])
    fun checkoutMustBeAfterCheckin(end: String) {
        assertThrows<ClientException> { StayDates.parse("2026-11-09", end) }
    }

    @Test
    fun leapDaysAndDaylightSavingUseCalendarNights() {
        assertThat(StayDates.parse("2024-02-28", "2024-03-01").nights).isEqualTo(2)
        assertThat(StayDates.parse("2026-03-28", "2026-03-30").nights).isEqualTo(2)
        assertThat(StayDates.parse("2026-10-24", "2026-10-26").nights).isEqualTo(2)
    }

    @Test
    fun overlapIsHalfOpenForAllContainmentShapes() {
        val stay = StayDates.parse("2026-11-06", "2026-11-09")
        for ((start, end) in
            listOf(
                "2026-11-06" to "2026-11-09",
                "2026-11-05" to "2026-11-10",
                "2026-11-07" to "2026-11-08",
                "2026-11-05" to "2026-11-07",
                "2026-11-08" to "2026-11-10",
            )) {
            assertThat(stay.overlaps(LocalDate.parse(start), LocalDate.parse(end))).isTrue()
        }
        assertThat(stay.overlaps(LocalDate.parse("2026-11-04"), stay.start)).isFalse()
        assertThat(stay.overlaps(stay.end, LocalDate.parse("2026-11-11"))).isFalse()
    }
}
