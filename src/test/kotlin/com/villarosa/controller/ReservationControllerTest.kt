package com.villarosa.controller

import com.villarosa.exception.ExceptionHandler as VillarosaExceptionHandler
import com.villarosa.repository.model.Apartment
import com.villarosa.repository.model.ReservationInfo
import com.villarosa.service.ReservationService
import org.junit.jupiter.api.Test
import org.mockito.Mockito.doThrow
import org.mockito.kotlin.whenever
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.boot.test.mock.mockito.MockBean
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@WebMvcTest(controllers = [ReservationController::class])
@AutoConfigureMockMvc(addFilters = false)
@Import(VillarosaExceptionHandler::class)
class ReservationControllerTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    @MockBean
    lateinit var reservationService: ReservationService

    @Test
    fun createReservation_returnsId() {
        whenever(reservationService.createReservation(1, 2, "2020-01-01", "2020-01-05")).thenReturn(7)

        mockMvc.perform(
            post("/reservation")
                .param("customerId", "1")
                .param("roomId", "2")
                .param("startDate", "2020-01-01")
                .param("endDate", "2020-01-05")
                .accept(MediaType.APPLICATION_JSON)
        )
            .andExpect(status().isOk)
            .andExpect(content().string("7"))
    }

    @Test
    fun findAvailableApartments_returnsList() {
        val apartments = listOf(
            Apartment(1, 2, "South", "Lake", 100, 150),
            Apartment(2, 3, "East", "Garden", 120, 170)
        )
        whenever(reservationService.findAvailableApartments("2020-01-01", "2020-01-10"))
            .thenReturn(apartments)

        mockMvc.perform(
            get("/reservation/available-apartments")
                .param("startDate", "2020-01-01")
                .param("endDate", "2020-01-10")
                .accept(MediaType.APPLICATION_JSON)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].id").value(1))
            .andExpect(jsonPath("$[1].id").value(2))
    }

    @Test
    fun findReservationsByCustomer_returnsList() {
        val reservations = listOf(
            ReservationInfo(1, 1, 2, "2020-01-01", "2020-01-05"),
            ReservationInfo(2, 1, 3, "2020-02-01", "2020-02-05")
        )
        whenever(reservationService.findReservationsByCustomer(1)).thenReturn(reservations)

        mockMvc.perform(
            get("/reservation/customer")
                .param("customerId", "1")
                .accept(MediaType.APPLICATION_JSON)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].id").value(1))
            .andExpect(jsonPath("$[1].id").value(2))
    }

    @Test
    fun cancelReservation_returnsOk() {
        mockMvc.perform(
            delete("/reservation/")
                .param("reservationId", "2")
                .accept(MediaType.APPLICATION_JSON)
        )
            .andExpect(status().isOk)
    }

    @Test
    fun updateReservationRoom_returnsOk() {
        mockMvc.perform(
            patch("/reservation/")
                .param("reservationId", "2")
                .param("newRoomId", "3")
                .accept(MediaType.APPLICATION_JSON)
        )
            .andExpect(status().isOk)
    }

    @Test
    fun findAvailableApartments_returnsBadRequestOnClientException() {
        doThrow(VillarosaExceptionHandler.ClientException("Date should have format: yyyy-MM-dd"))
            .`when`(reservationService).findAvailableApartments("2020/01/01", "2020-01-10")

        mockMvc.perform(
            get("/reservation/available-apartments")
                .param("startDate", "2020/01/01")
                .param("endDate", "2020-01-10")
                .accept(MediaType.APPLICATION_JSON)
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.message").value("Date should have format: yyyy-MM-dd"))
    }
}
