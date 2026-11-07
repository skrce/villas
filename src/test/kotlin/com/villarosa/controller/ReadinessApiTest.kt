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
class ReadinessApiTest
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
        jdbc.update(
            "INSERT INTO apartments(id,name,reference,capacity,active,version,property_id) VALUES(1,'Synthetic readiness','READY',4,TRUE,0,'villa-rosa')"
        )
        browser = TestHttpSession.create(sessions, mvc)
    }

    private fun postBody(body: String, key: String = java.util.UUID.randomUUID().toString()) =
        mvc.perform(
            post("/api/v1/apartments/1/readiness")
                .cookie(browser.cookie)
                .header("X-CSRF-TOKEN", browser.csrf)
                .header("Origin", "http://localhost:5173")
                .header("Idempotency-Key", key)
                .contentType("application/json")
                .content(body)
        )

    @Test
    fun ownerReviewsReadinessAndRecordsAStableTransition() {
        mvc.perform(get("/api/v1/apartments/1/readiness").cookie(browser.cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.state").value("DIRTY"))
            .andExpect(jsonPath("$.version").value(0))
        val key = java.util.UUID.randomUUID().toString()
        repeat(2) {
            postBody("""{"state":"IN_PROGRESS","expectedVersion":0}""", key)
                .andExpect(status().isOk)
                .andExpect(jsonPath("$.readiness.state").value("IN_PROGRESS"))
                .andExpect(jsonPath("$.readiness.version").value(1))
        }
        mvc.perform(get("/api/v1/apartments/1/readiness/events").cookie(browser.cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.items.length()").value(1))
            .andExpect(jsonPath("$.items[0].id").isString)
            .andExpect(jsonPath("$.items[0].actorId").isString)
    }

    @ParameterizedTest
    @ValueSource(
        strings =
            [
                "{}",
                "{\"state\":\"CLEAN\"}",
                "{\"expectedVersion\":0}",
                "{\"state\":\"IN_PROGRESS\",\"expectedVersion\":0.5}",
                "{\"state\":\"IN_PROGRESS\",\"expectedVersion\":\"0\"}",
                "{\"state\":\"IN_PROGRESS\",\"expectedVersion\":-1}",
                "{\"state\":1,\"expectedVersion\":0}",
                "{\"state\":1.0,\"expectedVersion\":0}",
                "{\"state\":\"1\",\"expectedVersion\":0}",
                "{\"state\":true,\"expectedVersion\":0}",
            ]
    )
    fun requiresExplicitIntegerVersionsAndAReadinessState(body: String) {
        postBody(body).andExpect(status().isBadRequest)
    }

    @Test
    fun readinessNeverAllowsAnonymousOrUnapprovedRoles() {
        mvc.perform(get("/api/v1/apartments/1/readiness")).andExpect(status().isUnauthorized)
        mvc.perform(
                get("/api/v1/apartments/1/readiness")
                    .with(user("housekeeping").roles("HOUSEKEEPING"))
            )
            .andExpect(status().isForbidden)
    }

    @Test
    fun readinessWritesRequireCsrfOriginAndStableOperationKeys() {
        mvc.perform(
                post("/api/v1/apartments/1/readiness")
                    .cookie(browser.cookie)
                    .contentType("application/json")
                    .content("""{"state":"IN_PROGRESS","expectedVersion":0}""")
            )
            .andExpect(status().isForbidden)
        postBody("""{"state":"IN_PROGRESS","expectedVersion":0}""", "invalid")
            .andExpect(status().isBadRequest)
        postBody("""{"state":"CLEAN","expectedVersion":0}""")
            .andExpect(status().isConflict)
            .andExpect(jsonPath("$.code").value("INVALID_READINESS_TRANSITION"))
    }
}
