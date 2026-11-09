package com.villarosa.controller

import com.villarosa.TestHttpSession
import com.villarosa.repository.ApartmentRepository
import com.villarosa.repository.CustomerRepository
import com.villarosa.repository.ReservationRepository
import com.villarosa.repository.model.Apartment
import com.villarosa.repository.model.Customer
import com.villarosa.repository.model.Reservation
import java.time.LocalDate
import java.util.UUID
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.HttpHeaders
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.session.jdbc.JdbcIndexedSessionRepository
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@ActiveProfiles("test")
@SpringBootTest
@AutoConfigureMockMvc
class ApiRegressionTest
@Autowired
constructor(
    private val mvc: MockMvc,
    private val reservations: ReservationRepository,
    private val apartments: ApartmentRepository,
    private val customers: CustomerRepository,
    private val jdbc: JdbcTemplate,
    private val sessions: JdbcIndexedSessionRepository,
    private val json: tools.jackson.databind.ObjectMapper,
) {
    @BeforeEach
    fun resetData() {
        com.villarosa.TestData.reset(jdbc)
        browser = TestHttpSession.create(sessions, mvc)
    }

    private lateinit var browser: TestHttpSession

    @ParameterizedTest
    @ValueSource(strings = ["/reservation", "/reservation/", "/api/v1/reservations"])
    fun cancelAcceptsGeneratedClientAndLegacyPaths(path: String) {
        val booking = saveReservation()

        mvc.perform(
                delete(path)
                    .cookie(browser.cookie)
                    .header("X-CSRF-TOKEN", browser.csrf)
                    .header("Origin", "http://localhost:5173")
                    .header("Idempotency-Key", UUID.randomUUID().toString())
                    .param("expectedVersion", "0")
                    .param("reservationId", booking.id.toString())
            )
            .andExpect(status().isOk)

        assertThat(reservations.findById(booking.id!!).get().status)
            .isEqualTo(com.villarosa.repository.model.ReservationStatus.CANCELLED)
    }

    @ParameterizedTest
    @ValueSource(strings = ["/reservation", "/reservation/", "/api/v1/reservations"])
    fun moveAcceptsGeneratedClientAndLegacyPaths(path: String) {
        val booking = saveReservation()
        val destination =
            apartments.save(
                Apartment(null, 2, "East", "Garden", 100, 150, propertyId = "villa-rosa")
            )
        com.villarosa.TestData.configureSyntheticRate(jdbc, destination.id!!)
        val quoted =
            mvc.perform(
                    post("/api/v1/booking-quotes")
                        .cookie(browser.cookie)
                        .header("X-CSRF-TOKEN", browser.csrf)
                        .header("Origin", "http://localhost:5173")
                        .contentType("application/json")
                        .content(
                            """{"roomId":${destination.id},"startDate":"2026-11-06","endDate":"2026-11-09","guestCount":1}"""
                        )
                )
                .andExpect(status().isOk)
                .andReturn()
                .response
                .contentAsString
        val quoteId = json.readTree(quoted).get("id").asText()

        mvc.perform(
                patch(path)
                    .cookie(browser.cookie)
                    .header("X-CSRF-TOKEN", browser.csrf)
                    .header("Origin", "http://localhost:5173")
                    .header("Idempotency-Key", UUID.randomUUID().toString())
                    .param("expectedVersion", "0")
                    .param("reservationId", booking.id.toString())
                    .param("newRoomId", destination.id.toString())
                    .param("quoteId", quoteId)
            )
            .andExpect(status().isOk)

        assertThat(reservations.findById(booking.id!!).get().roomId).isEqualTo(destination.id)
    }

    @Test
    fun emptyCustomerFieldReturnsBadRequest() {
        mvc.perform(
                post("/customer")
                    .cookie(browser.cookie)
                    .header("X-CSRF-TOKEN", browser.csrf)
                    .header("Origin", "http://localhost:5173")
                    .header("Idempotency-Key", UUID.randomUUID().toString())
                    .param("expectedVersion", "0")
                    .contentType("application/json")
                    .content(
                        """{"firstName":"","lastName":"Example","phone":"000","address":"Synthetic address"}"""
                    )
            )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value("HTTP_400"))
    }

    @Test
    fun emptyReservationDatesReturnBadRequest() {
        mvc.perform(
                post("/reservation")
                    .cookie(browser.cookie)
                    .header("X-CSRF-TOKEN", browser.csrf)
                    .header("Origin", "http://localhost:5173")
                    .header("Idempotency-Key", UUID.randomUUID().toString())
                    .param("expectedVersion", "0")
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
                    .cookie(browser.cookie)
                    .header("X-CSRF-TOKEN", browser.csrf)
                    .header("Origin", "http://localhost:5173")
                    .header("Idempotency-Key", UUID.randomUUID().toString())
                    .param("expectedVersion", "0")
                    .param("reservationId", Int.MAX_VALUE.toString())
            )
            .andExpect(status().isNotFound)
            .andExpect(jsonPath("$.message").value("Reservation does not exist."))
    }

    @Test
    fun malformedReservationIdReturnsBadRequest() {
        mvc.perform(
                delete("/reservation/")
                    .cookie(browser.cookie)
                    .header("X-CSRF-TOKEN", browser.csrf)
                    .header("Origin", "http://localhost:5173")
                    .header("Idempotency-Key", UUID.randomUUID().toString())
                    .param("expectedVersion", "0")
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
                    .cookie(browser.cookie)
                    .header("X-CSRF-TOKEN", browser.csrf)
                    .header("Origin", "http://localhost:5173")
                    .header("Idempotency-Key", UUID.randomUUID().toString())
                    .param("expectedVersion", "0")
                    .param("reservationId", "sensitive-invalid-value")
            )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value("HTTP_400"))
            .andExpect(jsonPath("$.message").value("Bad Request"))
    }

    @ParameterizedTest
    @ValueSource(strings = ["/customer", "/customer/", "/api/v1/customers"])
    fun customerSearchAllowsOneOptionalFilterOnEverySupportedPath(path: String) {
        customers.save(
            Customer.buildCustomer(
                "Unicode",
                "Гостин",
                "000",
                "Synthetic address",
                businessId = "villa-rosa",
            )
        )

        mvc.perform(
                get(path)
                    .cookie(browser.cookie)
                    .header("X-CSRF-TOKEN", browser.csrf)
                    .header("Origin", "http://localhost:5173")
                    .header("Idempotency-Key", UUID.randomUUID().toString())
                    .param("expectedVersion", "0")
                    .param("firstName", "Unicode")
            )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].lastName").value("Гостин"))
    }

    @ParameterizedTest
    @ValueSource(strings = ["/apartment", "/apartment/", "/api/v1/apartments"])
    fun apartmentListingSupportsLegacyAndCanonicalPaths(path: String) {
        val room =
            apartments.save(
                Apartment(null, 2, "South", "Lake", 100, 150, propertyId = "villa-rosa")
            )

        mvc.perform(
                get(path)
                    .cookie(browser.cookie)
                    .header("X-CSRF-TOKEN", browser.csrf)
                    .header("Origin", "http://localhost:5173")
                    .header("Idempotency-Key", UUID.randomUUID().toString())
                    .param("expectedVersion", "0")
            )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].id").value(room.id))
    }

    @ParameterizedTest
    @ValueSource(strings = ["/customer", "/customer/", "/api/v1/customers"])
    fun customerCreationSupportsLegacyAndCanonicalPaths(path: String) {
        val result =
            mvc.perform(
                    post(path)
                        .cookie(browser.cookie)
                        .header("X-CSRF-TOKEN", browser.csrf)
                        .header("Origin", "http://localhost:5173")
                        .header("Idempotency-Key", UUID.randomUUID().toString())
                        .param("expectedVersion", "0")
                        .contentType("application/json")
                        .content(
                            """{"firstName":"Test","lastName":"Guest","phone":"000","address":"Synthetic address"}"""
                        )
                )
                .andExpect(status().isOk)
                .andReturn()

        assertThat(customers.findById(result.response.contentAsString.toInt())).isPresent
    }

    @ParameterizedTest
    @ValueSource(strings = ["/reservation", "/reservation/", "/api/v1/reservations"])
    fun reservationCreationSupportsLegacyAndCanonicalPaths(path: String) {
        val existing = saveReservation()
        com.villarosa.TestData.configureSyntheticRate(jdbc, existing.roomId!!)
        val quote =
            mvc.perform(
                    post("/api/v1/booking-quotes")
                        .cookie(browser.cookie)
                        .header("X-CSRF-TOKEN", browser.csrf)
                        .header("Origin", "http://localhost:5173")
                        .contentType("application/json")
                        .content(
                            """{"roomId":${existing.roomId},"startDate":"2026-11-10","endDate":"2026-11-13","guestCount":1}"""
                        )
                )
                .andExpect(status().isOk)
                .andReturn()
                .response
                .contentAsString
        val quoteId = json.readTree(quote).get("id").asText()
        val result =
            mvc.perform(
                    post(path)
                        .cookie(browser.cookie)
                        .header("X-CSRF-TOKEN", browser.csrf)
                        .header("Origin", "http://localhost:5173")
                        .header("Idempotency-Key", UUID.randomUUID().toString())
                        .param("expectedVersion", "0")
                        .param("customerId", existing.customerId.toString())
                        .param("roomId", existing.roomId.toString())
                        .param("startDate", "2026-11-10")
                        .param("endDate", "2026-11-13")
                        .param("quoteId", quoteId)
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
                    .cookie(browser.cookie)
                    .header("X-CSRF-TOKEN", browser.csrf)
                    .header("Origin", "http://localhost:5173")
                    .header("Idempotency-Key", UUID.randomUUID().toString())
                    .param("expectedVersion", "0")
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
                    .cookie(browser.cookie)
                    .header("X-CSRF-TOKEN", browser.csrf)
                    .header("Origin", "http://localhost:5173")
                    .header("Idempotency-Key", UUID.randomUUID().toString())
                    .param("expectedVersion", "0")
                    .param("customerId", booking.customerId.toString())
            )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].id").value(booking.id))
    }

    private fun saveReservation(): Reservation {
        val guest =
            customers.save(
                Customer.buildCustomer(
                    "Test",
                    "Guest",
                    "000",
                    "Synthetic address",
                    businessId = "villa-rosa",
                )
            )
        val room =
            apartments.save(
                Apartment(null, 2, "South", "Lake", 100, 150, propertyId = "villa-rosa")
            )
        return reservations.save(
            Reservation.buildReservation(
                guest.id!!,
                room.id!!,
                LocalDate.parse("2026-11-06"),
                LocalDate.parse("2026-11-09"),
                businessId = "villa-rosa",
            )
        )
    }
}
