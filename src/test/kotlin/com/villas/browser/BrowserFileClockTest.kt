package com.villas.browser

import java.nio.file.Files
import java.nio.file.Path
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeParseException
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir

class BrowserFileClockTest {
    @TempDir lateinit var directory: Path

    @Test
    fun fileControlsOnlyTheTestClockAndRetainsMicrosecondsAcrossZones() {
        val file = directory.resolve("instant.txt")
        Files.writeString(file, "2026-11-07T10:00:00.123456Z")
        val clock = BrowserFileClock(file)
        assertThat(clock.instant()).isEqualTo(Instant.parse("2026-11-07T10:00:00.123456Z"))
        assertThat(clock.withZone(ZoneId.of("Europe/Skopje")).zone)
            .isEqualTo(ZoneId.of("Europe/Skopje"))
        assertThat(clock.withZone(ZoneId.of("Europe/Skopje")).instant()).isEqualTo(clock.instant())
        Files.writeString(file, "invalid")
        assertThatThrownBy { clock.instant() }.isInstanceOf(DateTimeParseException::class.java)
    }

    @Test
    fun anAbsentOrRemovedControlFileUsesTheRealClock() {
        val file = directory.resolve("instant.txt")
        val clock = BrowserFileClock(file)
        val before = Instant.now()
        assertThat(clock.instant()).isAfterOrEqualTo(before).isBeforeOrEqualTo(Instant.now())
        Files.writeString(file, "2026-11-07T10:00:00Z")
        Files.delete(file)
        assertThat(clock.instant()).isAfterOrEqualTo(before).isBeforeOrEqualTo(Instant.now())
    }
}
