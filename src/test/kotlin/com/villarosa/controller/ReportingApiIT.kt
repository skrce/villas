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
import tools.jackson.databind.ObjectMapper

@SpringBootTest
@ActiveProfiles("test")
@AutoConfigureMockMvc
@org.testcontainers.junit.jupiter.Testcontainers
class ReportingApiIT
@Autowired
constructor(
    private val mvc: MockMvc,
    private val jdbc: JdbcTemplate,
    private val sessions: JdbcIndexedSessionRepository,
    private val json: ObjectMapper,
) {
    private lateinit var browser: TestHttpSession
    private val query = "kind=CHARGES&startDate=2026-11-07&endDate=2026-11-08"

    @BeforeEach
    fun fixtures() {
        TestData.reset(jdbc, database.jdbcUrl)
        browser = TestHttpSession.create(sessions, mvc)
    }

    @Test
    fun ownersReadNoStoreReportsAndSafeCsvDownloads() {
        mvc.perform(get("/api/v1/today").cookie(browser.cookie))
            .andExpect(status().isOk)
            .andExpect(header().string("Cache-Control", "no-store"))
        val result =
            mvc.perform(get("/api/v1/reports?$query").cookie(browser.cookie))
                .andExpect(status().isOk)
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.notices[0]").value("NO_ROOMS"))
                .andReturn()
        val id = json.readTree(result.response.contentAsString).get("snapshotId").asText()
        mvc.perform(get("/api/v1/reports/export?$query&snapshotId=$id").cookie(browser.cookie))
            .andExpect(status().isOk)
            .andExpect(content().contentType("text/csv;charset=UTF-8"))
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(header().string("X-Content-Type-Options", "nosniff"))
            .andExpect(
                header()
                    .string(
                        "Content-Disposition",
                        "attachment; filename=\"villas-charges-2026-11-07-2026-11-08.csv\"",
                    )
            )
    }

    @Test
    fun anonymousAndUnapprovedRolesCannotReadAnyAggregateOrExport() {
        for (path in
            listOf(
                "/api/v1/today",
                "/api/v1/reports?$query",
                "/api/v1/reports/export?$query&snapshotId=x",
            )) {
            mvc.perform(get(path))
                .andExpect(status().isUnauthorized)
                .andExpect(header().string("Cache-Control", "no-store"))
            for (role in listOf("HOUSEKEEPING", "FRONT_DESK", "OWNER")) mvc.perform(
                    get(path).with(user("synthetic").roles(role))
                )
                .andExpect(status().isForbidden)
        }
    }

    @Test
    fun revokedSessionsCannotDownloadPreviouslyReviewedReports() {
        jdbc.update(
            "UPDATE staff_accounts SET security_version=security_version+1 WHERE id=?",
            TestData.ownerIdentity().id,
        )
        mvc.perform(get("/api/v1/reports/export?$query&snapshotId=x").cookie(browser.cookie))
            .andExpect(status().isUnauthorized)
            .andExpect(header().doesNotExist("Content-Disposition"))
    }

    @Test
    fun invalidFiltersAndChangedExportsReturnErrorsWithoutAttachments() {
        for (params in
            listOf(
                "kind=OTHER&startDate=2026-01-01&endDate=2026-01-02",
                "kind=BALANCES&startDate=2026-01-01&endDate=2028-01-01",
                "kind=CHARGES&startDate=2026-02-30&endDate=2026-03-02",
                "$query&roomId=-1",
            )) mvc.perform(get("/api/v1/reports?$params").cookie(browser.cookie))
            .andExpect(status().isBadRequest)
        mvc.perform(get("/api/v1/reports/export?$query&snapshotId=stale").cookie(browser.cookie))
            .andExpect(status().isConflict)
            .andExpect(jsonPath("$.code").value("REPORT_CHANGED"))
            .andExpect(header().doesNotExist("Content-Disposition"))
    }

    companion object {
        @org.testcontainers.junit.jupiter.Container
        @JvmField
        val database = com.villarosa.TestDatabases.postgres()

        @JvmStatic
        @org.junit.jupiter.api.BeforeAll
        fun migrate() {
            com.villarosa.DatabaseMigrations.migrate(
                database.jdbcUrl,
                database.username,
                database.password,
            )
        }

        @JvmStatic
        @org.springframework.test.context.DynamicPropertySource
        fun properties(registry: org.springframework.test.context.DynamicPropertyRegistry) {
            registry.add("spring.session.jdbc.initialize-schema") { "never" }
            registry.add("spring.datasource.url", database::getJdbcUrl)
            registry.add("spring.datasource.username", database::getUsername)
            registry.add("spring.datasource.password", database::getPassword)
            registry.add("spring.datasource.driver-class-name", database::getDriverClassName)
            registry.add("spring.jpa.hibernate.ddl-auto") { "validate" }
        }
    }
}
