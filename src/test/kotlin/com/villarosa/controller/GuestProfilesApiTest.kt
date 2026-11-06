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
class GuestProfilesApiTest
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
    fun aWalkInCanBeCreatedAndFoundByFullNameWithoutContactFields() {
        val id =
            mvc.perform(
                    post("/api/v1/customers")
                        .cookie(browser.cookie)
                        .header("X-CSRF-TOKEN", browser.csrf)
                        .header("Origin", "http://localhost:5173")
                        .contentType("application/json")
                        .content("""{"firstName":"Јана","lastName":"Гостин"}""")
                )
                .andExpect(status().isOk)
                .andReturn()
                .response
                .contentAsString
                .toInt()
        mvc.perform(
                post("/api/v1/customers/query")
                    .cookie(browser.cookie)
                    .header("X-CSRF-TOKEN", browser.csrf)
                    .header("Origin", "http://localhost:5173")
                    .contentType("application/json")
                    .content("""{"name":"гостин јана","limit":1}""")
            )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.items[0].id").value(id))
            .andExpect(jsonPath("$.items[0].phone").isEmpty)
            .andExpect(jsonPath("$.items[0].propertyId").doesNotExist())
            .andExpect(header().string("Cache-Control", "no-store"))
    }

    @ParameterizedTest
    @ValueSource(
        strings =
            [
                "{}",
                "{\"active\":false}",
                "{\"expectedVersion\":0}",
                "{\"active\":false,\"expectedVersion\":null}",
            ]
    )
    fun statusRequiresBothTheExplicitActionAndTheReviewedVersion(body: String) {
        mvc.perform(
                post("/api/v1/customers/1/status")
                    .cookie(browser.cookie)
                    .header("X-CSRF-TOKEN", browser.csrf)
                    .header("Origin", "http://localhost:5173")
                    .contentType("application/json")
                    .content(body)
            )
            .andExpect(status().isBadRequest)
    }

    @Test
    fun guestReplacementCannotAssumeAnOmittedVersionIsZero() {
        mvc.perform(
                put("/api/v1/customers/1")
                    .cookie(browser.cookie)
                    .header("X-CSRF-TOKEN", browser.csrf)
                    .header("Origin", "http://localhost:5173")
                    .contentType("application/json")
                    .content("""{"firstName":"Private","lastName":"Guest"}""")
            )
            .andExpect(status().isBadRequest)
    }

    @ParameterizedTest
    @ValueSource(strings = ["query", "duplicates", "1/status"])
    fun housekeepingCannotCallGuestManagementOrSearchRoutesDirectly(path: String) {
        mvc.perform(
                post("/api/v1/customers/$path")
                    .with(user("housekeeping").roles("HOUSEKEEPING"))
                    .contentType("application/json")
                    .content("{}")
            )
            .andExpect(status().isForbidden)
            .andExpect(jsonPath("$.code").value("ACCESS_DENIED"))
    }

    @ParameterizedTest
    @ValueSource(strings = ["/api/v1/customers/1", "/api/v1/customers/1/reservations"])
    fun housekeepingCannotReadGuestDetailsOrHistory(path: String) {
        mvc.perform(get(path).with(user("housekeeping").roles("HOUSEKEEPING")))
            .andExpect(status().isForbidden)
    }

    @Test
    fun anOwnerStillNeedsCsrfAndOriginForPrivateSearch() {
        mvc.perform(
                post("/api/v1/customers/query")
                    .cookie(browser.cookie)
                    .contentType("application/json")
                    .content("{}")
            )
            .andExpect(status().isForbidden)
    }
}
