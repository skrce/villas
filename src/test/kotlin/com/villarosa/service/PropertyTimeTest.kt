package com.villarosa.service

import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class PropertyTimeTest {
    @Test
    fun propertyMidnightUsesSkopjeWinterAndSummerOffsets() {
        for ((instant, date) in
            listOf(
                "2026-11-06T22:59:59Z" to "2026-11-06",
                "2026-11-06T23:00:00Z" to "2026-11-07",
                "2026-07-01T21:59:59Z" to "2026-07-01",
                "2026-07-01T22:00:00Z" to "2026-07-02",
            )) assertThat(
                PropertyTime(Clock.fixed(Instant.parse(instant), ZoneOffset.UTC)).today().toString()
            )
            .isEqualTo(date)
    }

    @Test
    fun eventInstantsRetainUtcAndDatabaseMicrosecondPrecision() {
        val instant = Instant.parse("2026-11-06T23:00:00.123456789Z")
        assertThat(PropertyTime(Clock.fixed(instant, ZoneOffset.UTC)).now())
            .isEqualTo(Instant.parse("2026-11-06T23:00:00.123456Z"))
    }
}
