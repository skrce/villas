package com.villarosa.controller

import com.villarosa.service.*
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

@RestController
@Tag(name = "Reports")
class ReportingController(private val reports: PeriodReports, private val today: TodayDashboard) {
    @GetMapping("/api/v1/today")
    @Operation(
        operationId = "today",
        summary =
            "Read a consistent Owner-only snapshot of today's work and current balance attention",
    )
    fun today() = today.read()

    @GetMapping("/api/v1/reports")
    @Operation(
        operationId = "periodReport",
        summary = "Read a complete bounded report with definitions and source drill-downs",
    )
    fun read(
        @RequestParam kind: ReportKind,
        @RequestParam startDate: String,
        @RequestParam endDate: String,
        @RequestParam(required = false) roomId: Int?,
    ) = reports.read(kind, startDate, endDate, roomId)

    @GetMapping("/api/v1/reports/export")
    @Operation(
        operationId = "exportReport",
        summary =
            "Download a bounded UTF-8 CSV only when its source snapshot still matches the reviewed report",
    )
    fun export(
        @RequestParam kind: ReportKind,
        @RequestParam startDate: String,
        @RequestParam endDate: String,
        @RequestParam(required = false) roomId: Int?,
        @RequestParam snapshotId: String,
    ): ResponseEntity<ByteArray> {
        val bytes = reports.csv(kind, startDate, endDate, roomId, snapshotId)
        return ResponseEntity.ok()
            .contentType(MediaType("text", "csv", Charsets.UTF_8))
            .header(
                HttpHeaders.CONTENT_DISPOSITION,
                "attachment; filename=\"villas-${kind.name.lowercase()}-$startDate-$endDate.csv\"",
            )
            .header(HttpHeaders.CACHE_CONTROL, "no-store")
            .header("X-Content-Type-Options", "nosniff")
            .body(bytes)
    }
}
