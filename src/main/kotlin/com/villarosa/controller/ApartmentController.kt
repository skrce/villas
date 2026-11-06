package com.villarosa.controller

import com.villarosa.exception.missing
import com.villarosa.repository.model.*
import com.villarosa.service.*
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import jakarta.validation.constraints.*
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.*

data class RoomCreateRequest(
    @field:NotBlank @field:Size(max = 200) val name: String,
    @field:NotBlank @field:Size(max = 32) val reference: String,
    @field:NotNull
    @field:Min(1)
    @field:Max(1000)
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED)
    val capacity: Int?,
    @field:Size(max = 200) val orientation: String? = null,
    @field:Size(max = 200) val view: String? = null,
    @field:Size(max = 200) val bedConfiguration: String? = null,
    @field:Size(max = 1000) val features: String? = null,
    @field:Size(max = 50) val floor: String? = null,
) {
    fun profile() =
        RoomProfile(
            name,
            reference,
            capacity!!,
            orientation,
            view,
            bedConfiguration,
            features,
            floor,
        )
}

data class RoomUpdateRequest(
    @field:Valid val details: RoomCreateRequest,
    @field:NotNull
    @field:Min(0)
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED)
    val expectedVersion: Long?,
)

data class RoomBlockRequest(
    @field:NotBlank val startDate: String,
    @field:NotBlank val endDate: String,
    @field:Size(max = 200) val reason: String = "Maintenance",
)

@Tag(name = "Apartment")
@RestController
class ApartmentController(
    private val apartmentService: ApartmentService,
    private val inventory: ReservationService,
) {
    @GetMapping(
        value = ["/apartment", "/apartment/", "/api/v1/apartments"],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        summary = "List rooms for compatibility and booking selectors",
        operationId = "listApartments",
    )
    fun getAllApartments(): List<Apartment> = apartmentService.getAllApartments()

    @GetMapping("/api/v1/apartments/directory")
    @Operation(
        summary = "Read a bounded room directory by name or reference",
        operationId = "apartmentDirectory",
    )
    fun directory(
        @RequestParam(required = false) name: String?,
        @RequestParam(defaultValue = "false") includeArchived: Boolean,
        @RequestParam(defaultValue = "0") afterId: Int,
        @RequestParam(defaultValue = "50") limit: Int,
    ): RoomPage = apartmentService.directory(name, includeArchived, afterId, limit)

    @GetMapping("/api/v1/apartments/{apartmentId}")
    @Operation(
        summary = "Read a property-scoped current or archived room",
        operationId = "getApartment",
    )
    fun get(@PathVariable apartmentId: Int): Apartment =
        apartmentService.findApartmentById(apartmentId) ?: missing("Room does not exist.")

    @PostMapping("/api/v1/apartments")
    @Operation(
        summary = "Add a named room with a unique property reference",
        operationId = "createApartment",
    )
    fun create(@Valid @RequestBody body: RoomCreateRequest): Apartment =
        apartmentService.create(body.profile())

    @PutMapping("/api/v1/apartments/{apartmentId}")
    @Operation(
        summary = "Edit a reviewed room without invalidating current or future stays",
        operationId = "updateApartment",
    )
    fun update(
        @PathVariable apartmentId: Int,
        @Valid @RequestBody body: RoomUpdateRequest,
    ): Apartment =
        apartmentService.update(apartmentId, body.expectedVersion!!, body.details.profile())

    @PostMapping("/api/v1/apartments/{apartmentId}/status")
    @Operation(
        summary = "Archive or restore a room while retaining its history",
        operationId = "setApartmentStatus",
    )
    fun status(
        @PathVariable apartmentId: Int,
        @Valid @RequestBody body: RecordStatusRequest,
    ): Apartment = apartmentService.status(apartmentId, body.expectedVersion!!, body.active!!)

    @PostMapping("/api/v1/apartments/{apartmentId}/maintenance")
    @Operation(
        summary = "Add a dated maintenance block using a private JSON body",
        operationId = "blockApartment",
    )
    fun block(
        @PathVariable apartmentId: Int,
        @Valid @RequestBody body: RoomBlockRequest,
        @RequestHeader("Idempotency-Key") key: String,
    ): MaintenanceBlock =
        inventory.block(apartmentId, body.startDate, body.endDate, body.reason, key).maintenance!!
}
