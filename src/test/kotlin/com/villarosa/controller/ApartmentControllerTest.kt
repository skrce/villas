package com.villarosa.controller

import com.villarosa.exception.ExceptionHandler as VillarosaExceptionHandler
import com.villarosa.repository.model.Apartment
import com.villarosa.service.ApartmentService
import org.junit.jupiter.api.Test
import org.mockito.kotlin.whenever
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.boot.test.mock.mockito.MockBean
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@WebMvcTest(controllers = [ApartmentController::class])
@AutoConfigureMockMvc(addFilters = false)
@Import(VillarosaExceptionHandler::class)
class ApartmentControllerTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    @MockBean
    lateinit var apartmentService: ApartmentService

    @Test
    fun getAllApartments_returnsList() {
        val apartments = listOf(
            Apartment(1, 2, "South", "Lake", 100, 150),
            Apartment(2, 3, "East", "Garden", 120, 170)
        )
        whenever(apartmentService.getAllApartments()).thenReturn(apartments)

        mockMvc.perform(
            get("/apartment")
                .accept(MediaType.APPLICATION_JSON)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].id").value(1))
            .andExpect(jsonPath("$[1].id").value(2))
    }
}
