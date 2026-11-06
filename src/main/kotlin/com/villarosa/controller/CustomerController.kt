package com.villarosa.controller

import com.villarosa.exception.missing
import com.villarosa.repository.model.Customer
import com.villarosa.service.CustomerService
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
    @field:NotBlank
    @field:Size(max = 200)
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED)
    val phone: String,
    @field:NotBlank
    @field:Size(max = 200)
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED)
    val address: String,
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
            body.phone.trim(),
            body.address.trim(),
        )

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
