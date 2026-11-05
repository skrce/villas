package com.villarosa.controller

import com.villarosa.repository.model.Apartment
import com.villarosa.service.ApartmentService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.slf4j.LoggerFactory
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

@Tag(name = "Apartment")
@RestController
class ApartmentController(private val apartmentService: ApartmentService) {
    companion object {
        private val LOGGER = LoggerFactory.getLogger(ApartmentController::class.java)
    }

    @GetMapping(
        value = ["/apartment", "/api/v1/apartments"],
        produces = [MediaType.APPLICATION_JSON_VALUE],
    )
    @Operation(summary = "Lists all apartments.", operationId = "listApartments")
    fun getAllApartments(): List<Apartment> {
        LOGGER.info("Called getAllApartments()")
        return apartmentService.getAllApartments()
    }
}
