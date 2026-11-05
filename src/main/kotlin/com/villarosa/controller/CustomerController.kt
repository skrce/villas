package com.villarosa.controller

import com.villarosa.repository.model.Customer
import com.villarosa.service.CustomerService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@Tag(name = "Customer")
@RestController
class CustomerController(private val customerService: CustomerService) {
    @PostMapping(
        value = ["/customer", "/api/v1/customers"],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(summary = "Creates a customer.", operationId = "createCustomer")
    fun createCustomer(
        @Parameter(description = "First name") @RequestParam("firstName") firstName: String,
        @Parameter(description = "Last name") @RequestParam("lastName") lastName: String,
        @Parameter(description = "Phone number") @RequestParam("phone") phone: String,
        @Parameter(description = "Address (Country, City, Street, Number)")
        @RequestParam("address")
        address: String,
    ): Int {
        return customerService.createCustomer(firstName, lastName, phone, address)
    }

    @GetMapping(
        value = ["/customer", "/api/v1/customers"],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(
        summary = "Search customer by part of firstName or phone.",
        operationId = "searchCustomer",
    )
    fun searchCustomer(
        @Parameter(description = "First name")
        @RequestParam("firstName", required = false)
        firstName: String?,
        @Parameter(description = "Phone number")
        @RequestParam("phone", required = false)
        phone: String?,
    ): List<Customer> {
        return customerService.searchCustomer(firstName, phone)
    }
}
