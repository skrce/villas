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
        jdbc.update(
            "INSERT INTO apartments (id,name,reference,capacity,active,version,property_id) VALUES (1,'Room','R-1',4,TRUE,0,'villa-rosa')"
        )
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
    @ValueSource(strings = ["1.5", "1000.9", "-0.5", "\"3\""])
    fun capacityRequiresJsonIntegersForBothCreateAndUpdate(capacity: String) {
        val details = """{"name":"Changed","reference":"NEW","capacity":$capacity}"""
        mvc.perform(
                post("/api/v1/apartments")
                    .cookie(browser.cookie)
                    .header("X-CSRF-TOKEN", browser.csrf)
                    .header("Origin", "http://localhost:5173")
                    .contentType("application/json")
                    .content(details)
            )
            .andExpect(status().isBadRequest)
        mvc.perform(
                put("/api/v1/apartments/1")
                    .cookie(browser.cookie)
                    .header("X-CSRF-TOKEN", browser.csrf)
                    .header("Origin", "http://localhost:5173")
                    .contentType("application/json")
                    .content("""{"details":$details,"expectedVersion":0}""")
            )
            .andExpect(status().isBadRequest)
        org.assertj.core.api.Assertions.assertThat(
                jdbc.queryForObject("SELECT capacity FROM apartments WHERE id=1", Int::class.java)
            )
            .isEqualTo(4)
    }

    @ParameterizedTest
    @ValueSource(strings = ["-0.5", "0.9", "1.0", "\"0\""])
    fun reviewedRoomVersionsAreNeverTruncatedOrCoerced(version: String) {
        mvc.perform(
                put("/api/v1/apartments/1")
                    .cookie(browser.cookie)
                    .header("X-CSRF-TOKEN", browser.csrf)
                    .header("Origin", "http://localhost:5173")
                    .contentType("application/json")
                    .content(
                        """{"details":{"name":"Changed","reference":"R-1","capacity":4},"expectedVersion":$version}"""
                    )
            )
            .andExpect(status().isBadRequest)
        org.assertj.core.api.Assertions.assertThat(
                jdbc.queryForObject("SELECT name FROM apartments WHERE id=1", String::class.java)
            )
            .isEqualTo("Room")
    }

    @Test
    fun integerVersionedReplacementPreservesTheRoomIdentity() {
        mvc.perform(
                put("/api/v1/apartments/1")
                    .cookie(browser.cookie)
                    .header("X-CSRF-TOKEN", browser.csrf)
                    .header("Origin", "http://localhost:5173")
                    .contentType("application/json")
                    .content(
                        """{"details":{"name":"Renamed","reference":"R-1","capacity":4},"expectedVersion":0}"""
                    )
            )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.id").value(1))
            .andExpect(jsonPath("$.version").value(1))
            .andExpect(jsonPath("$.name").value("Renamed"))
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
