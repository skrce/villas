package com.villarosa.controller

import com.villarosa.repository.model.ReadinessState
import com.villarosa.service.DailyOperations
import com.villarosa.service.FrontDeskList
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.web.bind.annotation.*

@RestController
@Tag(name = "Operations")
class DailyOperationsController(private val daily: DailyOperations) {
    @GetMapping("/api/v1/front-desk")
    @Operation(
        operationId = "frontDesk",
        summary =
            "Read bounded arrival, departure, in-house and attention lists for the property day",
    )
    fun desk(
        @RequestParam(defaultValue = "ARRIVALS") list: FrontDeskList,
        @RequestParam(defaultValue = "0") afterId: Int,
        @RequestParam(defaultValue = "50") limit: Int,
        @RequestParam(required = false) expectedDate: String?,
    ) = daily.desk(list, afterId, limit, expectedDate)

    @GetMapping("/api/v1/housekeeping")
    @Operation(
        operationId = "housekeeping",
        summary =
            "Read room readiness, physical occupancy and dated maintenance without guest or financial data",
    )
    fun housekeeping(
        @RequestParam(defaultValue = "0") afterId: Int,
        @RequestParam(defaultValue = "50") limit: Int,
        @RequestParam(required = false) state: ReadinessState?,
        @RequestParam(required = false) expectedDate: String?,
    ) = daily.housekeeping(afterId, limit, state, expectedDate)
}
