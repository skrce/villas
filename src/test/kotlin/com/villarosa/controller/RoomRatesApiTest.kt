package com.villarosa.controller

import com.villarosa.TestData
import com.villarosa.TestHttpSession
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

@SpringBootTest
@ActiveProfiles("test")
@AutoConfigureMockMvc
class RoomRatesApiTest
@Autowired
constructor(
    private val mvc: MockMvc,
    private val jdbc: JdbcTemplate,
    private val sessions: JdbcIndexedSessionRepository,
) {
    private lateinit var browser: TestHttpSession

    @BeforeEach
    fun fixtures() {
        TestData.reset(jdbc)
        browser = TestHttpSession.create(sessions, mvc)
        jdbc.update(
            "INSERT INTO apartments (id,name,reference,capacity,active,version,property_id) VALUES (1,'Room','R-1',4,TRUE,0,'villa-rosa')"
        )
    }

    private fun update(body: String) =
        mvc.perform(
            put("/api/v1/apartments/1/rates")
                .cookie(browser.cookie)
                .header("X-CSRF-TOKEN", browser.csrf)
                .header("Origin", "http://localhost:5173")
                .contentType("application/json")
                .content(body)
        )

    @Test
    fun ratesStartUnconfiguredAndTheOwnerCanSaveAndPreviewExactEURAmounts() {
        mvc.perform(get("/api/v1/apartments/1/rates").cookie(browser.cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.baseNightlyCents").isEmpty)
            .andExpect(jsonPath("$.version").value(0))
        update("""{"expectedVersion":0,"currency":"EUR","baseNightlyCents":5001,"seasons":[]}""")
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.version").value(1))
        mvc.perform(
                post("/api/v1/apartments/1/rates/preview")
                    .cookie(browser.cookie)
                    .header("X-CSRF-TOKEN", browser.csrf)
                    .header("Origin", "http://localhost:5173")
                    .contentType("application/json")
                    .content("""{"startDate":"2028-02-28","endDate":"2028-03-01","guestCount":4}""")
            )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.totalCents").value(10002))
            .andExpect(jsonPath("$.nights").value(2))
            .andExpect(header().string("Cache-Control", "no-store"))
        update("""{"expectedVersion":0,"baseNightlyCents":5002}""").andExpect(status().isConflict)
        mvc.perform(get("/api/v1/apartments/1").cookie(browser.cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.baseRateCents").doesNotExist())
            .andExpect(jsonPath("$.rateCurrency").doesNotExist())
    }

    @ParameterizedTest
    @ValueSource(
        strings =
            [
                "null",
                "[null]",
                "[{}]",
                "[{\"name\":\"Summer\",\"startDate\":\"2030-01-01\",\"endDate\":\"2030-01-02\",\"nightlyCents\":null}]",
                "[{\"name\":\"Summer\",\"startDate\":\"2030-01-01\",\"endDate\":\"2030-01-02\",\"nightlyCents\":0}]",
            ]
    )
    fun incompleteSeasonsAreRejectedWithoutAWrite(value: String) {
        update("""{"expectedVersion":0,"baseNightlyCents":100,"seasons":$value}""")
            .andExpect(status().isBadRequest)
        mvc.perform(get("/api/v1/apartments/1/rates").cookie(browser.cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.version").value(0))
    }

    @ParameterizedTest
    @ValueSource(strings = ["0.5", "1.0", "\"100\"", "null", "true", "9007199254740992", "0", "-1"])
    fun centsRequirePositiveExactSupportedIntegerTokens(value: String) {
        update("""{"expectedVersion":0,"baseNightlyCents":$value}""")
            .andExpect(status().isBadRequest)
    }

    @ParameterizedTest
    @ValueSource(strings = ["0.5", "1.0", "\"0\"", "null", "true", "-1"])
    fun rateVersionsCannotBeOmittedCoercedOrFractional(value: String) {
        update("""{"expectedVersion":$value,"baseNightlyCents":100}""")
            .andExpect(status().isBadRequest)
    }

    @Test
    fun missingVersionsAndUnsupportedCurrencyAreRejected() {
        update("""{"baseNightlyCents":100}""").andExpect(status().isBadRequest)
        update("""{"expectedVersion":0,"currency":"USD","baseNightlyCents":100}""")
            .andExpect(status().isBadRequest)
        mvc.perform(
                put("/api/v1/apartments/1/rates")
                    .cookie(browser.cookie)
                    .contentType("application/json")
                    .content("{}")
            )
            .andExpect(status().isForbidden)
    }

    @Test
    fun nonOwnersCannotReadOrWriteRatesThroughDirectRequests() {
        mvc.perform(
                get("/api/v1/apartments/1/rates").with(user("housekeeping").roles("HOUSEKEEPING"))
            )
            .andExpect(status().isForbidden)
        mvc.perform(
                put("/api/v1/apartments/1/rates")
                    .with(user("housekeeping").roles("HOUSEKEEPING"))
                    .contentType("application/json")
                    .content("{}")
            )
            .andExpect(status().isForbidden)
        mvc.perform(get("/api/v1/apartments/1/rates")).andExpect(status().isUnauthorized)
    }
}
