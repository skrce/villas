package com.villarosa.service

import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import org.springframework.stereotype.Component

@Component
class PropertyTime(private val clock: Clock) {
    fun now(): Instant = clock.instant().truncatedTo(ChronoUnit.MICROS)

    fun today(): LocalDate = clock.instant().atZone(ZONE).toLocalDate()

    fun date(instant: Instant): LocalDate = instant.atZone(ZONE).toLocalDate()

    companion object {
        val ZONE: ZoneId = ZoneId.of("Europe/Skopje")
    }
}
