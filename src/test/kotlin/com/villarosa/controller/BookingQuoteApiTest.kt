package com.villarosa.controller

import com.villarosa.TestData
import com.villarosa.TestHttpSession
import com.villarosa.service.BookingQuote
import java.util.UUID
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.session.jdbc.JdbcIndexedSessionRepository
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*
import tools.jackson.databind.ObjectMapper

@SpringBootTest
@ActiveProfiles("test")
@AutoConfigureMockMvc
class BookingQuoteApiTest
@Autowired
constructor(
    private val mvc: MockMvc,
    private val jdbc: JdbcTemplate,
    private val sessions: JdbcIndexedSessionRepository,
    private val json: ObjectMapper,
) {
    private lateinit var browser: TestHttpSession
    private val body =
        """{"roomId":1,"startDate":"2030-01-01","endDate":"2030-01-03","guestCount":2}"""

    @BeforeEach
    fun fixtures() {
        TestData.reset(jdbc)
        TestData.seedOwner(jdbc, index = 1)
        browser = TestHttpSession.create(sessions, mvc)
        jdbc.update(
            "INSERT INTO apartments (id,property_id,name,reference,capacity,active,version,base_rate_cents,rate_version) VALUES (1,'villa-rosa','Room','R-1',4,TRUE,0,5001,1)"
        )
        jdbc.update(
            "INSERT INTO customers (id,property_id,first_name,last_name,active,version) VALUES (1,'villa-rosa','Walk','In',TRUE,0)"
        )
    }

    private fun postQuote(value: String = body) =
        mvc.perform(
            post("/api/v1/booking-quotes")
                .cookie(browser.cookie)
                .header("X-CSRF-TOKEN", browser.csrf)
                .header("Origin", "http://localhost:5173")
                .contentType("application/json")
                .content(value)
        )

    private fun quote(): BookingQuote =
        json.readValue(
            postQuote().andExpect(status().isOk).andReturn().response.contentAsString,
            BookingQuote::class.java,
        )

    private fun confirmation(quote: BookingQuote) =
        """{"customerId":1,"quoteId":"${quote.id}","roomId":1,"startDate":"2030-01-01","endDate":"2030-01-03","guestCount":2}"""

    private fun confirm(value: String, key: String = UUID.randomUUID().toString()) =
        mvc.perform(
            post("/api/v1/reservations/quoted")
                .cookie(browser.cookie)
                .header("X-CSRF-TOKEN", browser.csrf)
                .header("Origin", "http://localhost:5173")
                .header("Idempotency-Key", key)
                .contentType("application/json")
                .content(value)
        )

    @ParameterizedTest
    @ValueSource(strings = ["/reservation", "/reservation/", "/api/v1/reservations"])
    fun allCreationPathsRequireAReviewedQuote(path: String) {
        fun request(quoteId: String? = null) =
            post(path)
                .cookie(browser.cookie)
                .header("X-CSRF-TOKEN", browser.csrf)
                .header("Origin", "http://localhost:5173")
                .header("Idempotency-Key", UUID.randomUUID().toString())
                .param("customerId", "1")
                .param("roomId", "1")
                .param("startDate", "2030-01-01")
                .param("endDate", "2030-01-03")
                .param("guestCount", "2")
                .also { if (quoteId != null) it.param("quoteId", quoteId) }

        mvc.perform(request())
            .andExpect(status().isConflict)
            .andExpect(jsonPath("$.code").value("QUOTE_REQUIRED"))
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM reservations", Long::class.java))
            .isZero()
        assertThat(
                jdbc.queryForObject("SELECT COUNT(*) FROM inventory_operations", Long::class.java)
            )
            .isZero()
        mvc.perform(request(quote().id)).andExpect(status().isOk)
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM reservation_prices", Long::class.java))
            .isEqualTo(1)
    }

    @Test
    fun quoteConfirmationAndPriceReadUseTheSavedEURBreakdown() {
        val quote = quote()
        assertThat(quote.price.totalCents).isEqualTo(10002)
        val key = UUID.randomUUID().toString()
        val id =
            confirm(confirmation(quote), key)
                .andExpect(status().isOk)
                .andReturn()
                .response
                .contentAsString
                .toInt()
        confirm(confirmation(quote), key)
            .andExpect(status().isOk)
            .andExpect(content().string(id.toString()))
        mvc.perform(get("/api/v1/reservations/$id/price").cookie(browser.cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.recorded").value(true))
            .andExpect(jsonPath("$.price.quote.price.totalCents").value(10002))
            .andExpect(jsonPath("$.price.quote.id").value(quote.id))
            .andExpect(header().string("Cache-Control", "no-store"))
        mvc.perform(get("/api/v1/reservations/$id/prices").cookie(browser.cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.items.length()").value(1))
        mvc.perform(
                get("/api/v1/reservations/$id/prices").param("limit", "0").cookie(browser.cookie)
            )
            .andExpect(status().isBadRequest)
    }

    @Test
    fun changedRatesReturnAPersistedReplacementQuoteAndRequireAnotherExplicitConfirmation() {
        val old = quote()
        jdbc.update("UPDATE apartments SET base_rate_cents=6001,rate_version=2 WHERE id=1")
        val response =
            confirm(confirmation(old))
                .andExpect(status().isConflict)
                .andExpect(jsonPath("$.code").value("QUOTE_CHANGED"))
                .andExpect(jsonPath("$.replacementQuote.price.totalCents").value(12002))
                .andReturn()
                .response
                .contentAsString
        val fresh =
            json.treeToValue(
                json.readTree(response).get("replacementQuote"),
                BookingQuote::class.java,
            )
        assertThat(fresh.id).isNotEqualTo(old.id)
        mvc.perform(get("/api/v1/booking-quotes/${fresh.id}").cookie(browser.cookie))
            .andExpect(status().isOk)
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM reservations", Long::class.java))
            .isZero()
        confirm(confirmation(fresh)).andExpect(status().isOk)
    }

    @ParameterizedTest
    @ValueSource(strings = ["totalCents", "overrideCents", "discount", "fees", "propertyId"])
    fun unsupportedClientPricesAndScopeFieldsCannotAlterAQuote(field: String) {
        postQuote(body.dropLast(1) + ",\"$field\":1}").andExpect(status().isBadRequest)
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM booking_quotes", Long::class.java))
            .isZero()
    }

    @ParameterizedTest
    @ValueSource(strings = ["0.5", "\"2\"", "null", "true", "0", "-1"])
    fun partySizeRequiresAnExplicitPositiveIntegerWhenProvided(value: String) {
        postQuote(body.replace("\"guestCount\":2", "\"guestCount\":$value"))
            .andExpect(status().isBadRequest)
    }

    @Test
    fun missingAndForeignOwnerQuotesHaveNoProtectedDataInTheirResponses() {
        val quote = quote()
        jdbc.update(
            "UPDATE booking_quotes SET actor_id=? WHERE id=?",
            TestData.ownerIdentity(1).id,
            quote.id,
        )
        mvc.perform(get("/api/v1/booking-quotes/${quote.id}").cookie(browser.cookie))
            .andExpect(status().isNotFound)
            .andExpect(jsonPath("$.price").doesNotExist())
        confirm(confirmation(quote)).andExpect(status().isNotFound)
    }

    @Test
    fun historicalUnpricedRecordsHaveAnExplicitStateAndNoInventedAmount() {
        jdbc.update(
            "INSERT INTO reservations (id,property_id,customer_id,room_id,start_date,end_date,guest_count,status,version,created_at) VALUES (1,'villa-rosa',1,1,'2030-01-01','2030-01-03',2,'ACTIVE',0,CURRENT_TIMESTAMP)"
        )
        mvc.perform(get("/api/v1/reservations/1/price").cookie(browser.cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.recorded").value(false))
            .andExpect(jsonPath("$.price").isEmpty)
    }

    @Test
    fun quoteAndConfirmationWritesStillRequireOwnerSessionCsrfAndOrigin() {
        mvc.perform(
                post("/api/v1/booking-quotes")
                    .cookie(browser.cookie)
                    .contentType("application/json")
                    .content(body)
            )
            .andExpect(status().isForbidden)
        mvc.perform(
                post("/api/v1/booking-quotes")
                    .with(user("housekeeping").roles("HOUSEKEEPING"))
                    .contentType("application/json")
                    .content(body)
            )
            .andExpect(status().isForbidden)
        mvc.perform(get("/api/v1/booking-quotes/${UUID.randomUUID()}"))
            .andExpect(status().isUnauthorized)
    }
}
