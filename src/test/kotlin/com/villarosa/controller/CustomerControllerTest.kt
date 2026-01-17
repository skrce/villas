package com.villarosa.controller

import com.villarosa.exception.ExceptionHandler as VillarosaExceptionHandler
import com.villarosa.repository.model.Customer
import com.villarosa.service.CustomerService
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
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@WebMvcTest(controllers = [CustomerController::class])
@AutoConfigureMockMvc(addFilters = false)
@Import(VillarosaExceptionHandler::class)
class CustomerControllerTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    @MockBean
    lateinit var customerService: CustomerService

    @Test
    fun createCustomer_returnsId() {
        whenever(customerService.createCustomer("Jane", "Doe", "123", "Main")).thenReturn(12)

        mockMvc.perform(
            post("/customer")
                .param("firstName", "Jane")
                .param("lastName", "Doe")
                .param("phone", "123")
                .param("address", "Main")
                .accept(MediaType.APPLICATION_JSON)
        )
            .andExpect(status().isOk)
            .andExpect(content().string("12"))
    }

    @Test
    fun searchCustomer_returnsList() {
        val customer = Customer(1, "Jane", "Doe", "123", "Main")
        whenever(customerService.searchCustomer("Ja", "123")).thenReturn(listOf(customer))

        mockMvc.perform(
            get("/customer")
                .param("firstName", "Ja")
                .param("phone", "123")
                .accept(MediaType.APPLICATION_JSON)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].id").value(1))
            .andExpect(jsonPath("$[0].firstName").value("Jane"))
            .andExpect(jsonPath("$[0].lastName").value("Doe"))
            .andExpect(jsonPath("$[0].phone").value("123"))
            .andExpect(jsonPath("$[0].address").value("Main"))
    }

    @Test
    fun searchCustomer_returnsBadRequestOnClientException() {
        doThrow(VillarosaExceptionHandler.ClientException("You must provide at least one parameter!"))
            .`when`(customerService).searchCustomer(null, null)

        mockMvc.perform(
            get("/customer")
                .accept(MediaType.APPLICATION_JSON)
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.message").value("You must provide at least one parameter!"))
    }
}
