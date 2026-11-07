package com.villarosa.controller

import com.villarosa.*
import com.villarosa.repository.*
import com.villarosa.repository.model.*
import com.villarosa.service.*
import java.time.Instant
import java.util.UUID
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.session.jdbc.JdbcIndexedSessionRepository
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*

@SpringBootTest
@ActiveProfiles("test")
@Import(PriceClockConfiguration::class)
@AutoConfigureMockMvc
class StayOperationsApiTest
@Autowired
constructor(
    private val mvc: MockMvc,
    private val jdbc: JdbcTemplate,
    private val sessions: JdbcIndexedSessionRepository,
    private val rooms: ApartmentRepository,
    private val guests: CustomerRepository,
    private val quotes: QuoteService,
    private val inventory: ReservationService,
    private val clock: MutablePriceClock,
) {
    private lateinit var browser: TestHttpSession
    private var id = 0
    private var room = 0

    private fun key() = UUID.randomUUID().toString()

    @BeforeEach
    fun fixtures() {
        TestData.reset(jdbc)
        clock.value = Instant.parse("2026-11-07T12:00:00.123456Z")
        room = rooms.saveAndFlush(Apartment(capacity = 4, baseRateCents = 5001)).id!!
        val guest =
            guests.saveAndFlush(Customer(firstName = "Synthetic", lastName = "Operations")).id!!
        val quote = quotes.create(room, "2026-11-07", "2026-11-09", 2)
        id =
            inventory
                .createQuoted(guest, quote.id, room, quote.startDate, quote.endDate, 2, key())
                .resourceId
        browser = TestHttpSession.create(sessions, mvc)
    }

    private fun postBody(path: String, body: String, key: String = key()) =
        mvc.perform(
            post(path)
                .cookie(browser.cookie)
                .header("X-CSRF-TOKEN", browser.csrf)
                .header("Origin", "http://localhost:5173")
                .header("Idempotency-Key", key)
                .contentType("application/json")
                .content(body)
        )

    @Test
    fun ownersRecordArrivalDepartureAndRetainedOperationalHistory() {
        for ((index, state) in listOf("IN_PROGRESS", "INSPECTION", "CLEAN").withIndex()) {
            postBody(
                    "/api/v1/apartments/$room/readiness",
                    """{"state":"$state","expectedVersion":$index}""",
                )
                .andExpect(status().isOk)
        }
        val stable = key()
        repeat(2) {
            postBody(
                    "/api/v1/reservations/$id/check-in",
                    """{"expectedVersion":0,"readinessVersion":3}""",
                    stable,
                )
                .andExpect(status().isOk)
                .andExpect(jsonPath("$.reservation.phase").value("CHECKED_IN"))
                .andExpect(jsonPath("$.inventoryEvent.id").isString)
                .andExpect(jsonPath("$.inventoryEvent.operationKey").value(stable))
        }
        clock.value = Instant.parse("2026-11-09T12:00:00Z")
        postBody(
                "/api/v1/reservations/$id/check-out",
                """{"expectedVersion":1,"acknowledgeBalance":false}""",
            )
            .andExpect(status().isConflict)
            .andExpect(jsonPath("$.code").value("SETTLEMENT_REVIEW_REQUIRED"))
        postBody(
                "/api/v1/reservations/$id/check-out",
                """{"expectedVersion":1,"acknowledgeBalance":true}""",
            )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.reservation.phase").value("CHECKED_OUT"))
            .andExpect(jsonPath("$.readiness.state").value("DIRTY"))
    }

    @ParameterizedTest
    @ValueSource(
        strings =
            [
                "{}",
                "{\"expectedVersion\":0}",
                "{\"readinessVersion\":0}",
                "{\"expectedVersion\":0.5,\"readinessVersion\":0}",
                "{\"expectedVersion\":0,\"readinessVersion\":0.5}",
                "{\"expectedVersion\":\"0\",\"readinessVersion\":0}",
                "{\"expectedVersion\":0,\"readinessVersion\":-1}",
            ]
    )
    fun arrivalsRequireExplicitExactReviewedVersions(body: String) {
        postBody("/api/v1/reservations/$id/check-in", body).andExpect(status().isBadRequest)
    }

    @ParameterizedTest
    @ValueSource(strings = ["0", "\"true\"", "null"])
    fun departureAcknowledgementIsAnExplicitBoolean(value: String) {
        postBody(
                "/api/v1/reservations/$id/check-out",
                """{"expectedVersion":0,"acknowledgeBalance":$value}""",
            )
            .andExpect(status().isBadRequest)
    }

    @Test
    fun reasonedActionsRejectMissingReasonsAndPreserveThePreviousPrice() {
        postBody("/api/v1/reservations/$id/cancel", """{"expectedVersion":0,"reason":" "}""")
            .andExpect(status().isBadRequest)
        postBody("/api/v1/reservations/$id/no-show", """{"expectedVersion":0,"reason":" "}""")
            .andExpect(status().isBadRequest)
        postBody(
                "/api/v1/reservations/$id/cancel",
                """{"expectedVersion":0,"reason":"Synthetic guest cancellation"}""",
            )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.inventoryEvent.reason").value("Synthetic guest cancellation"))
        mvc.perform(get("/api/v1/reservations/$id/ledger").cookie(browser.cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.agreedCents").value(10002))
            .andExpect(jsonPath("$.accommodationCents").value(0))
    }

    @Test
    fun everyOperatingWriteRequiresOwnerMembershipCsrfOriginAndAStableKey() {
        for (action in
            listOf(
                "check-in",
                "check-out",
                "cancel",
                "no-show",
                "move",
                "change",
                "actual-times",
            )) {
            val path = "/api/v1/reservations/$id/$action"
            mvc.perform(post(path).contentType("application/json").content("{}"))
                .andExpect(status().isUnauthorized)
            mvc.perform(
                    post(path)
                        .with(user("housekeeping").roles("HOUSEKEEPING"))
                        .contentType("application/json")
                        .content("{}")
                )
                .andExpect(status().isForbidden)
            mvc.perform(
                    post(path).cookie(browser.cookie).contentType("application/json").content("{}")
                )
                .andExpect(status().isForbidden)
        }
        postBody(
                "/api/v1/reservations/$id/check-in",
                """{"expectedVersion":0,"readinessVersion":0}""",
                "wrong",
            )
            .andExpect(status().isBadRequest)
    }

    @Test
    fun propertyTimeResolutionRetainsMicrosecondsAndExplicitDaylightSavingChoices() {
        postBody(
                "/api/v1/property-time/options",
                """{"localDateTime":"2026-10-25T02:30:00.123456"}""",
            )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.options.length()").value(2))
            .andExpect(jsonPath("$.options[0].offset").value("+02:00"))
            .andExpect(jsonPath("$.options[0].utc").value("2026-10-25T00:30:00.123456Z"))
            .andExpect(jsonPath("$.options[1].offset").value("+01:00"))
        postBody("/api/v1/property-time/options", """{"localDateTime":"2026-03-29T02:30"}""")
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.options.length()").value(0))
        postBody("/api/v1/property-time/options", """{"localDateTime":"2026-06-06T12:30"}""")
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.options.length()").value(1))
        mvc.perform(
                post("/api/v1/property-time/options").contentType("application/json").content("{}")
            )
            .andExpect(status().isUnauthorized)
    }
}
