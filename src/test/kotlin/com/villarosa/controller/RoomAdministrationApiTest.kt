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
class RoomAdministrationApiTest
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
    }

    @Test
    fun anOwnerCreatesANamedRoomAndBlocksItWithJsonInsteadOfUrlNotes() {
        val saved =
            mvc.perform(
                    post("/api/v1/apartments")
                        .cookie(browser.cookie)
                        .header("X-CSRF-TOKEN", browser.csrf)
                        .header("Origin", "http://localhost:5173")
                        .contentType("application/json")
                        .content("""{"name":"Градина","reference":"garden-1","capacity":3}""")
                )
                .andExpect(status().isOk)
                .andExpect(jsonPath("$.name").value("Градина"))
                .andExpect(jsonPath("$.reference").value("GARDEN-1"))
                .andExpect(jsonPath("$.version").value(0))
                .andExpect(jsonPath("$.propertyId").doesNotExist())
                .andReturn()
                .response
                .contentAsString
        val id =
            tools.jackson.databind.json.JsonMapper.builder()
                .build()
                .readTree(saved)
                .get("id")
                .asInt()
        mvc.perform(
                post("/api/v1/apartments/$id/maintenance")
                    .cookie(browser.cookie)
                    .header("X-CSRF-TOKEN", browser.csrf)
                    .header("Origin", "http://localhost:5173")
                    .header("Idempotency-Key", java.util.UUID.randomUUID().toString())
                    .contentType("application/json")
                    .content(
                        """{"startDate":"2099-01-01","endDate":"2099-01-03","reason":"Synthetic repair"}"""
                    )
            )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.roomId").value(id))
        mvc.perform(
                get("/api/v1/maintenance-blocks")
                    .cookie(browser.cookie)
                    .param("startDate", "2099-01-01")
                    .param("endDate", "2099-02-01")
                    .param("roomId", "$id")
            )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.items[0].reason").value("Synthetic repair"))
    }

    @ParameterizedTest
    @ValueSource(
        strings =
            [
                "{}",
                "{\"name\":\"Room\",\"reference\":\"R-1\"}",
                "{\"name\":\"Room\",\"reference\":\"R-1\",\"capacity\":0}",
            ]
    )
    fun newRoomsRequireNamesReferencesAndExplicitValidCapacity(body: String) {
        mvc.perform(
                post("/api/v1/apartments")
                    .cookie(browser.cookie)
                    .header("X-CSRF-TOKEN", browser.csrf)
                    .header("Origin", "http://localhost:5173")
                    .contentType("application/json")
                    .content(body)
            )
            .andExpect(status().isBadRequest)
    }

    @Test
    fun roomUpdatesCannotDefaultMissingVersionsToZero() {
        mvc.perform(
                put("/api/v1/apartments/1")
                    .cookie(browser.cookie)
                    .header("X-CSRF-TOKEN", browser.csrf)
                    .header("Origin", "http://localhost:5173")
                    .contentType("application/json")
                    .content("""{"details":{"name":"Room","reference":"R-1","capacity":2}}""")
            )
            .andExpect(status().isBadRequest)
    }

    @ParameterizedTest
    @ValueSource(strings = ["/api/v1/apartments/1", "/api/v1/apartments/directory"])
    fun housekeepingCannotReadAdministrativeRoomRoutes(path: String) {
        mvc.perform(get(path).with(user("housekeeping").roles("HOUSEKEEPING")))
            .andExpect(status().isForbidden)
    }

    @ParameterizedTest
    @ValueSource(
        strings =
            [
                "/api/v1/apartments",
                "/api/v1/apartments/1/status",
                "/api/v1/apartments/1/maintenance",
            ]
    )
    fun housekeepingCannotManageRoomsOrMaintenance(path: String) {
        mvc.perform(
                post(path)
                    .with(user("housekeeping").roles("HOUSEKEEPING"))
                    .contentType("application/json")
                    .content("{}")
            )
            .andExpect(status().isForbidden)
    }
}
