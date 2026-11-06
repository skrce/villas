package com.villarosa.controller

import com.villarosa.service.*
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import jakarta.validation.constraints.*
import org.springframework.web.bind.annotation.*

data class SeasonRateRequest(
    @field:NotBlank @field:Size(max = 100) val name: String,
    @field:NotBlank val startDate: String,
    @field:NotBlank val endDate: String,
    @field:NotNull
    @field:Min(1)
    @field:Max(EuroCents.MAX)
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED)
    val nightlyCents: Long?,
) {
    fun rate() = SeasonRate(name, startDate, endDate, nightlyCents!!)
}

data class RateUpdateRequest(
    @field:NotNull
    @field:Min(0)
    @field:Max(EuroCents.MAX)
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED)
    val expectedVersion: Long?,
    val currency: String = "EUR",
    @field:NotNull
    @field:Min(1)
    @field:Max(EuroCents.MAX)
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED)
    val baseNightlyCents: Long?,
    @field:Valid
    @field:Size(max = PriceCalculator.MAX_SEASONS)
    val seasons: List<SeasonRateRequest> = emptyList(),
)

data class RatePreviewRequest(
    @field:NotBlank val startDate: String,
    @field:NotBlank val endDate: String,
    @field:Min(1) val guestCount: Int = 1,
)

@RestController
@Tag(name = "Rates")
class RateController(private val rates: RateService) {
    @GetMapping("/api/v1/apartments/{apartmentId}/rates")
    @Operation(
        operationId = "roomRates",
        summary = "Read configured EUR rates or an explicit unconfigured state",
    )
    fun get(@PathVariable apartmentId: Int): RoomRates = rates.get(apartmentId)

    @PutMapping("/api/v1/apartments/{apartmentId}/rates")
    @Operation(
        operationId = "updateRoomRates",
        summary = "Replace a reviewed room's base and non-overlapping seasonal rates",
    )
    fun update(
        @PathVariable apartmentId: Int,
        @Valid @RequestBody body: RateUpdateRequest,
    ): RoomRates =
        rates.update(
            apartmentId,
            body.expectedVersion!!,
            body.currency,
            body.baseNightlyCents!!,
            body.seasons.map { requireNotNull(it) { "Each season must be an object." }.rate() },
        )

    @PostMapping("/api/v1/apartments/{apartmentId}/rates/preview")
    @Operation(
        operationId = "previewRoomRates",
        summary =
            "Explain the accommodation price without reserving inventory or accepting a quote",
    )
    fun preview(
        @PathVariable apartmentId: Int,
        @Valid @RequestBody body: RatePreviewRequest,
    ): StayPrice = rates.preview(apartmentId, body.startDate, body.endDate, body.guestCount)
}
