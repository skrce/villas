package com.villarosa.controller

import com.villarosa.repository.ApartmentRepository
import com.villarosa.repository.CustomerRepository
import com.villarosa.repository.ReservationRepository
import com.villarosa.repository.model.Apartment
import com.villarosa.repository.model.Customer
import com.villarosa.repository.model.Reservation
import java.time.LocalDate
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.HttpHeaders
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.transaction.annotation.Transactional

@ActiveProfiles("test")
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class ApiRegressionTest
@Autowired
constructor(
    private val mvc: MockMvc,
    private val reservations: ReservationRepository,
    private val apartments: ApartmentRepository,
    private val customers: CustomerRepository,
) {
    private val authorization = "Basic dGVzdDp0ZXN0"

    @ParameterizedTest
    @ValueSource(strings = ["/reservation", "/reservation/", "/api/v1/reservations"])
    fun cancelAcceptsGeneratedClientAndLegacyPaths(path: String) {
        val booking = saveReservation()

        mvc.perform(
                delete(path)
                    .header(HttpHeaders.AUTHORIZATION, authorization)
                    .param("reservationId", booking.id.toString())
            )
            .andExpect(status().isOk)

        assertThat(reservations.findById(booking.id!!)).isEmpty
    }

    @ParameterizedTest
    @ValueSource(strings = ["/reservation", "/reservation/", "/api/v1/reservations"])
    fun moveAcceptsGeneratedClientAndLegacyPaths(path: String) {
        val booking = saveReservation()
        val destination = apartments.save(Apartment(null, 2, "East", "Garden", 100, 150))

        mvc.perform(
                patch(path)
                    .header(HttpHeaders.AUTHORIZATION, authorization)
                    .param("reservationId", booking.id.toString())
                    .param("newRoomId", destination.id.toString())
            )
            .andExpect(status().isOk)

        assertThat(reservations.findById(booking.id!!).get().roomId).isEqualTo(destination.id)
    }

    @Test
    fun emptyCustomerFieldReturnsBadRequest() {
        mvc.perform(
                post("/customer")
                    .header(HttpHeaders.AUTHORIZATION, authorization)
                    .param("firstName", "")
                    .param("lastName", "Example")
                    .param("phone", "000")
                    .param("address", "Synthetic address")
            )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.message").value("All params should have value"))
    }

    @Test
    fun emptyReservationDatesReturnBadRequest() {
        mvc.perform(
                post("/reservation")
                    .header(HttpHeaders.AUTHORIZATION, authorization)
                    .param("customerId", "1")
                    .param("roomId", "1")
                    .param("startDate", "")
                    .param("endDate", "2026-11-09")
            )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.message").value("Dates should not be empty"))
    }

    @Test
    fun missingReservationReturnsTheExistingClientError() {
        mvc.perform(
                delete("/reservation/")
                    .header(HttpHeaders.AUTHORIZATION, authorization)
                    .param("reservationId", Int.MAX_VALUE.toString())
            )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.message").value("Reservation does not exist."))
    }

    @Test
    fun malformedReservationIdReturnsBadRequest() {
        mvc.perform(
                delete("/reservation/")
                    .header(HttpHeaders.AUTHORIZATION, authorization)
                    .param("reservationId", "not-an-integer")
            )
            .andExpect(status().isBadRequest)
    }

    @ParameterizedTest
    @ValueSource(strings = ["", "Basic dGVzdDp3cm9uZw==", "Basic invalid"])
    fun businessRoutesRequireAuthentication(authorization: String) {
        mvc.perform(
                get("/apartment").apply {
                    if (authorization.isNotEmpty()) header(HttpHeaders.AUTHORIZATION, authorization)
                }
            )
            .andExpect(status().isUnauthorized)
            .andExpect(content().contentTypeCompatibleWith("application/json"))
            .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"))
    }

    @Test
    fun malformedCanonicalRequestHasASafeErrorEnvelope() {
        mvc.perform(
                delete("/api/v1/reservations")
                    .header(HttpHeaders.AUTHORIZATION, authorization)
                    .param("reservationId", "sensitive-invalid-value")
            )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value("HTTP_400"))
            .andExpect(jsonPath("$.message").value("Bad Request"))
    }

    @ParameterizedTest
    @ValueSource(strings = ["/customer", "/customer/", "/api/v1/customers"])
    fun customerSearchAllowsOneOptionalFilterOnEverySupportedPath(path: String) {
        customers.save(Customer.buildCustomer("Unicode", "Гостин", "000", "Synthetic address"))

        mvc.perform(
                get(path)
                    .header(HttpHeaders.AUTHORIZATION, authorization)
                    .param("firstName", "Unicode")
            )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].lastName").value("Гостин"))
    }

    @ParameterizedTest
    @ValueSource(strings = ["/apartment", "/apartment/", "/api/v1/apartments"])
    fun apartmentListingSupportsLegacyAndCanonicalPaths(path: String) {
        val room = apartments.save(Apartment(null, 2, "South", "Lake", 100, 150))

        mvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, authorization))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].id").value(room.id))
    }

    @ParameterizedTest
    @ValueSource(strings = ["/customer", "/customer/", "/api/v1/customers"])
    fun customerCreationSupportsLegacyAndCanonicalPaths(path: String) {
        val result =
            mvc.perform(
                    post(path)
                        .header(HttpHeaders.AUTHORIZATION, authorization)
                        .param("firstName", "Test")
                        .param("lastName", "Guest")
                        .param("phone", "000")
                        .param("address", "Synthetic address")
                )
                .andExpect(status().isOk)
                .andReturn()

        assertThat(customers.findById(result.response.contentAsString.toInt())).isPresent
    }

    @ParameterizedTest
    @ValueSource(strings = ["/reservation", "/reservation/", "/api/v1/reservations"])
    fun reservationCreationSupportsLegacyAndCanonicalPaths(path: String) {
        val existing = saveReservation()
        val result =
            mvc.perform(
                    post(path)
                        .header(HttpHeaders.AUTHORIZATION, authorization)
                        .param("customerId", existing.customerId.toString())
                        .param("roomId", existing.roomId.toString())
                        .param("startDate", "2026-11-10")
                        .param("endDate", "2026-11-13")
                )
                .andExpect(status().isOk)
                .andReturn()

        assertThat(reservations.findById(result.response.contentAsString.toInt())).isPresent
    }

    @ParameterizedTest
    @ValueSource(
        strings =
            [
                "/reservation/available-apartments",
                "/reservation/available-apartments/",
                "/api/v1/reservations/available-apartments",
            ]
    )
    fun availabilitySupportsLegacyAndCanonicalPaths(path: String) {
        val booking = saveReservation()

        mvc.perform(
                get(path)
                    .header(HttpHeaders.AUTHORIZATION, authorization)
                    .param("startDate", "2026-11-10")
                    .param("endDate", "2026-11-13")
            )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].id").value(booking.roomId))
    }

    @ParameterizedTest
    @ValueSource(
        strings =
            ["/reservation/customer", "/reservation/customer/", "/api/v1/reservations/customer"]
    )
    fun reservationListingSupportsLegacyAndCanonicalPaths(path: String) {
        val booking = saveReservation()

        mvc.perform(
                get(path)
                    .header(HttpHeaders.AUTHORIZATION, authorization)
                    .param("customerId", booking.customerId.toString())
            )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].id").value(booking.id))
    }

    private fun saveReservation(): Reservation {
        val guest =
            customers.save(Customer.buildCustomer("Test", "Guest", "000", "Synthetic address"))
        val room = apartments.save(Apartment(null, 2, "South", "Lake", 100, 150))
        return reservations.save(
            Reservation.buildReservation(
                guest.id!!,
                room.id!!,
                LocalDate.parse("2026-11-06"),
                LocalDate.parse("2026-11-09"),
            )
        )
    }
}
