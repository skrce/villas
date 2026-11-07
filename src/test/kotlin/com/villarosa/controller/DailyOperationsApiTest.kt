package com.villarosa.controller

import com.villarosa.TestData
import com.villarosa.TestHttpSession
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.session.jdbc.JdbcIndexedSessionRepository
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*

@SpringBootTest
@ActiveProfiles("test")
@AutoConfigureMockMvc
class DailyOperationsApiTest
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
    fun ownersReadBoundedPropertyDayLists() {
        mvc.perform(get("/api/v1/front-desk").cookie(browser.cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.list").value("ARRIVALS"))
            .andExpect(jsonPath("$.items").isArray)
        mvc.perform(get("/api/v1/housekeeping").cookie(browser.cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.rooms").isArray)
            .andExpect(jsonPath("$.propertyDate").isString)
    }

    @Test
    fun anonymousAndUnapprovedRolesCannotReadEitherWorkflow() {
        for (path in listOf("/api/v1/front-desk", "/api/v1/housekeeping")) {
            mvc.perform(get(path)).andExpect(status().isUnauthorized)
            mvc.perform(get(path).with(user("housekeeping").roles("HOUSEKEEPING")))
                .andExpect(status().isForbidden)
        }
    }

    @Test
    fun invalidFiltersAndBoundsNeverReturnPartialResults() {
        for (path in
            listOf(
                "/api/v1/front-desk?list=other",
                "/api/v1/front-desk?afterId=-1",
                "/api/v1/housekeeping?state=clean",
                "/api/v1/housekeeping?limit=51",
            )) mvc.perform(get(path).cookie(browser.cookie)).andExpect(status().isBadRequest)
        mvc.perform(get("/api/v1/housekeeping?expectedDate=1000-01-01").cookie(browser.cookie))
            .andExpect(status().isConflict)
            .andExpect(jsonPath("$.code").value("PROPERTY_DATE_CHANGED"))
    }
}
