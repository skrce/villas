package com.villarosa.controller

import com.villarosa.repository.ApartmentRepository
import com.villarosa.repository.CustomerRepository
import com.villarosa.repository.ReservationRepository
import com.villarosa.repository.model.Apartment
import com.villarosa.repository.model.Customer
import com.villarosa.repository.model.Reservation
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.http.HttpHeaders
import org.springframework.security.core.userdetails.User
import org.springframework.security.core.userdetails.UserDetailsService
import org.springframework.security.provisioning.InMemoryUserDetailsManager
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.transaction.annotation.Transactional
import java.text.SimpleDateFormat

@SpringBootTest
@AutoConfigureMockMvc
@Import(RegressionTestUsers::class)
@Transactional
class ApiRegressionTest @Autowired constructor(
    private val mvc: MockMvc,
    private val reservations: ReservationRepository,
    private val apartments: ApartmentRepository,
    private val customers: CustomerRepository
) {
    private val authorization = "Basic dGVzdDp0ZXN0"

    @ParameterizedTest
    @ValueSource(strings = ["/reservation", "/reservation/"])
    fun cancelAcceptsGeneratedClientAndLegacyPaths(path: String) {
        val booking = saveReservation()

        mvc.perform(delete(path).header(HttpHeaders.AUTHORIZATION, authorization)
            .param("reservationId", booking.id.toString()))
            .andExpect(status().isOk)

        assertThat(reservations.findById(booking.id!!)).isEmpty
    }

    @ParameterizedTest
    @ValueSource(strings = ["/reservation", "/reservation/"])
    fun moveAcceptsGeneratedClientAndLegacyPaths(path: String) {
        val booking = saveReservation()
        val destination = apartments.save(Apartment(null, 2, "East", "Garden", 100, 150))

        mvc.perform(patch(path).header(HttpHeaders.AUTHORIZATION, authorization)
            .param("reservationId", booking.id.toString())
            .param("newRoomId", destination.id.toString()))
            .andExpect(status().isOk)

        assertThat(reservations.findById(booking.id!!).get().roomId).isEqualTo(destination.id)
    }

    @Test
    fun emptyCustomerFieldReturnsBadRequest() {
        mvc.perform(post("/customer").header(HttpHeaders.AUTHORIZATION, authorization)
            .param("firstName", "")
            .param("lastName", "Example")
            .param("phone", "000")
            .param("address", "Synthetic address"))
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.message").value("All params should have value"))
    }

    @Test
    fun emptyReservationDatesReturnBadRequest() {
        mvc.perform(post("/reservation").header(HttpHeaders.AUTHORIZATION, authorization)
            .param("customerId", "1")
            .param("roomId", "1")
            .param("startDate", "")
            .param("endDate", "2026-11-09"))
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.message").value("Dates should not be empty"))
    }

    @Test
    fun missingReservationReturnsTheExistingClientError() {
        mvc.perform(delete("/reservation/").header(HttpHeaders.AUTHORIZATION, authorization)
            .param("reservationId", Int.MAX_VALUE.toString()))
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.message").value("Reservation does not exist."))
    }

    @Test
    fun malformedReservationIdReturnsBadRequest() {
        mvc.perform(delete("/reservation/").header(HttpHeaders.AUTHORIZATION, authorization)
            .param("reservationId", "not-an-integer"))
            .andExpect(status().isBadRequest)
    }

    @Test
    fun businessRoutesRequireAuthentication() {
        mvc.perform(get("/apartment"))
            .andExpect(status().isUnauthorized)
    }

    private fun saveReservation(): Reservation {
        val guest = customers.save(Customer.buildCustomer("Test", "Guest", "000", "Synthetic address"))
        val room = apartments.save(Apartment(null, 2, "South", "Lake", 100, 150))
        val dates = SimpleDateFormat("yyyy-MM-dd")
        return reservations.save(Reservation.buildReservation(
            guest.id!!, room.id!!, dates.parse("2026-11-06"), dates.parse("2026-11-09")
        ))
    }
}

@TestConfiguration(proxyBeanMethods = false)
class RegressionTestUsers {
    @Bean
    fun regressionUsers(): UserDetailsService = InMemoryUserDetailsManager(
        User.withUsername("test").password("{noop}test").roles("USER").build()
    )
}
