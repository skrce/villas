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
class BookingCalendarApiTest
@Autowired
constructor(
    private val mvc: MockMvc,
    private val jdbc: JdbcTemplate,
    private val sessions: JdbcIndexedSessionRepository,
) {
    @BeforeEach
    fun fixtures() {
        TestData.reset(jdbc)
    }

    @Test
    fun aSignedInOwnerReceivesAnEmptyCalendarWithExplicitArrays() {
        val browser = TestHttpSession.create(sessions, mvc)
        mvc.perform(
                get("/api/v1/calendar")
                    .cookie(browser.cookie)
                    .param("startDate", "2030-01-01")
                    .param("endDate", "2030-01-08")
            )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.startDate").value("2030-01-01"))
            .andExpect(jsonPath("$.rooms").isEmpty)
            .andExpect(jsonPath("$.stays").isEmpty)
            .andExpect(jsonPath("$.maintenance").isEmpty)
    }

    @Test
    fun calendarNeverAllowsAnonymousOrOtherRoles() {
        mvc.perform(
                get("/api/v1/calendar")
                    .param("startDate", "2030-01-01")
                    .param("endDate", "2030-01-08")
            )
            .andExpect(status().isUnauthorized)
        mvc.perform(
                get("/api/v1/calendar")
                    .with(user("housekeeping").roles("HOUSEKEEPING"))
                    .param("startDate", "2030-01-01")
                    .param("endDate", "2030-01-08")
            )
            .andExpect(status().isForbidden)
    }

    @Test
    fun calendarDatesAreRequiredAndInvalidRoomCursorsFailClosed() {
        val browser = TestHttpSession.create(sessions, mvc)
        mvc.perform(get("/api/v1/calendar").cookie(browser.cookie)).andExpect(status().isBadRequest)
        for (cursor in listOf("-1", "2147483648", "1.5")) mvc.perform(
                get("/api/v1/calendar")
                    .cookie(browser.cookie)
                    .param("startDate", "2030-01-01")
                    .param("endDate", "2030-01-08")
                    .param("afterRoomId", cursor)
            )
            .andExpect(status().isBadRequest)
    }
}
