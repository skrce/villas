package com.villarosa.controller

import com.villarosa.exception.missing
import com.villarosa.repository.model.Customer
import com.villarosa.repository.model.ReservationPage
import com.villarosa.repository.model.ReservationStatus
import com.villarosa.service.CustomerService
import com.villarosa.service.GuestPage
import com.villarosa.service.GuestProfile
import io.swagger.v3.oas.annotations.Hidden
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import jakarta.validation.constraints.*
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.*

data class CustomerCreateRequest(
    @field:NotBlank
    @field:Size(max = 200)
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED)
    val firstName: String,
    @field:NotBlank
    @field:Size(max = 200)
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED)
    val lastName: String,
    @field:Size(max = 200) val phone: String? = null,
    @field:Size(max = 500) val address: String? = null,
    @field:Size(max = 254) val email: String? = null,
    @field:Size(max = 2000) val notes: String? = null,
    val allowDuplicate: Boolean = false,
)

data class GuestQueryRequest(
    @field:Size(max = 200) val name: String? = null,
    @field:Size(max = 200) val phone: String? = null,
    val includeArchived: Boolean = false,
    @field:Min(0) val afterId: Int = 0,
    @field:Min(1) @field:Max(100) val limit: Int = 50,
)

data class GuestUpdateRequest(
    @field:NotBlank @field:Size(max = 200) val firstName: String,
    @field:NotBlank @field:Size(max = 200) val lastName: String,
    @field:Size(max = 200) val phone: String? = null,
    @field:Size(max = 500) val address: String? = null,
    @field:Size(max = 254) val email: String? = null,
    @field:Size(max = 2000) val notes: String? = null,
    @field:NotNull
    @field:Min(0)
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED)
    val expectedVersion: Long?,
)

data class RecordStatusRequest(
    @field:NotNull @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val active: Boolean?,
    @field:NotNull
    @field:Min(0)
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED)
    val expectedVersion: Long?,
)

data class CustomerSearchRequest(
    @field:Size(max = 200) val firstName: String? = null,
    @field:Size(max = 200) val phone: String? = null,
    @field:Min(1) @field:Max(100) val limit: Int = 50,
)

@Tag(name = "Customer")
@RestController
class CustomerController(private val service: CustomerService) {
    @PostMapping(
        value = ["/customer", "/customer/", "/api/v1/customers"],
        consumes = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(summary = "Create a guest using a private JSON body", operationId = "createCustomer")
    fun create(@Valid @RequestBody body: CustomerCreateRequest): Int =
        service.createCustomer(
            body.firstName.trim(),
            body.lastName.trim(),
            body.phone,
            body.address,
            body.email,
            body.notes,
            body.allowDuplicate,
        )

    @PostMapping("/api/v1/customers/query")
    @Operation(
        summary = "List or search guests with private combined criteria and a bounded cursor",
        operationId = "queryCustomers",
    )
    fun query(@Valid @RequestBody body: GuestQueryRequest): GuestPage =
        service.query(body.name, body.phone, body.includeArchived, body.afterId, body.limit)

    @PostMapping("/api/v1/customers/duplicates")
    @Operation(
        summary = "Review possible guest matches without merging identities",
        operationId = "customerDuplicates",
    )
    fun duplicates(@Valid @RequestBody body: CustomerCreateRequest): List<Customer> =
        service.duplicates(
            GuestProfile(
                body.firstName,
                body.lastName,
                body.phone,
                body.address,
                body.email,
                body.notes,
            )
        )

    @PutMapping("/api/v1/customers/{customerId}")
    @Operation(
        summary = "Replace a guest profile using the reviewed version",
        operationId = "updateCustomer",
    )
    fun update(
        @PathVariable customerId: Int,
        @Valid @RequestBody body: GuestUpdateRequest,
    ): Customer =
        service.update(
            customerId,
            body.expectedVersion!!,
            GuestProfile(
                body.firstName,
                body.lastName,
                body.phone,
                body.address,
                body.email,
                body.notes,
            ),
        )

    @PostMapping("/api/v1/customers/{customerId}/status")
    @Operation(
        summary = "Archive or restore a guest without deleting history",
        operationId = "setCustomerStatus",
    )
    fun status(
        @PathVariable customerId: Int,
        @Valid @RequestBody body: RecordStatusRequest,
    ): Customer = service.status(customerId, body.expectedVersion!!, body.active!!)

    @GetMapping("/api/v1/customers/{customerId}/reservations")
    @Operation(
        summary = "Read a bounded guest history including retained cancellations",
        operationId = "customerReservations",
    )
    fun history(
        @PathVariable customerId: Int,
        @RequestParam(defaultValue = "0") afterId: Int,
        @RequestParam(defaultValue = "50") limit: Int,
        @RequestParam(required = false) status: ReservationStatus?,
    ): ReservationPage = service.history(customerId, afterId, limit, status)

    @PostMapping("/api/v1/customers/search")
    @Operation(
        summary = "Search guests without putting contact criteria in a URL",
        operationId = "searchCustomer",
    )
    fun search(@Valid @RequestBody body: CustomerSearchRequest): List<Customer> =
        service.searchCustomer(body.firstName?.trim(), body.phone?.trim(), body.limit)

    @GetMapping("/api/v1/customers/{customerId}")
    @Operation(summary = "Read a property-scoped guest", operationId = "getCustomer")
    fun get(@PathVariable customerId: Int): Customer =
        service.findCustomerById(customerId).orElseGet { missing("Guest does not exist.") }

    @Hidden
    @GetMapping(value = ["/customer", "/customer/", "/api/v1/customers"])
    fun legacySearch(
        @RequestParam(required = false) firstName: String?,
        @RequestParam(required = false) phone: String?,
    ): List<Customer> = service.searchCustomer(firstName, phone)
}
