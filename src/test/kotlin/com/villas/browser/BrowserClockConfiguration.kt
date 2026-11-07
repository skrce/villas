package com.villas.browser

import java.nio.file.Files
import java.nio.file.NoSuchFileException
import java.nio.file.Path
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import org.springframework.boot.autoconfigure.AutoConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Primary

@AutoConfiguration
class BrowserClockConfiguration {
    @Bean
    @Primary
    fun browserClock(): Clock {
        check(System.getenv("VILLAS_LOCAL_INSTANCE")?.matches(Regex("e2e-[a-f0-9]{12}")) == true)
        check(System.getenv("VILLAS_AUTH_PROVIDER") == "synthetic")
        return BrowserFileClock(Path.of(checkNotNull(System.getenv("VILLAS_BROWSER_CLOCK_FILE"))))
    }
}

class BrowserFileClock(private val path: Path, private val zone: ZoneId = ZoneOffset.UTC) :
    Clock() {
    override fun getZone(): ZoneId = zone

    override fun withZone(zone: ZoneId): Clock = BrowserFileClock(path, zone)

    override fun instant(): Instant =
        try {
            Instant.parse(Files.readString(path).trim())
        } catch (_: NoSuchFileException) {
            Instant.now()
        }
}
