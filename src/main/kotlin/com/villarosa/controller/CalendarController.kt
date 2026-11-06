package com.villarosa.controller

import com.villarosa.service.BookingCalendar
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@Tag(name = "Calendar")
class CalendarController(private val calendar: BookingCalendar) {
    @GetMapping("/api/v1/calendar")
    @Operation(
        operationId = "bookingCalendar",
        summary = "Read a bounded consistent room calendar of active stays and maintenance",
    )
    fun read(
        @RequestParam startDate: String,
        @RequestParam endDate: String,
        @RequestParam(defaultValue = "0") afterRoomId: Int,
        @RequestParam(defaultValue = "20") limit: Int,
        @RequestParam(defaultValue = "false") includeArchived: Boolean,
    ) = calendar.read(startDate, endDate, afterRoomId, limit, includeArchived)
}
