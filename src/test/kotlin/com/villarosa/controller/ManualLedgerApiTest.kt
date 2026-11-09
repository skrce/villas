package com.villarosa.controller

import com.villarosa.TestData
import com.villarosa.TestHttpSession
import com.villarosa.repository.*
import com.villarosa.repository.model.*
import com.villarosa.service.*
import java.util.UUID
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
class ManualLedgerApiTest
@Autowired
constructor(
    private val mvc: MockMvc,
    private val jdbc: JdbcTemplate,
    private val sessions: JdbcIndexedSessionRepository,
    private val rooms: ApartmentRepository,
    private val guests: CustomerRepository,
    private val quotes: QuoteService,
    private val inventory: ReservationService,
    private val time: PropertyTime,
) {
    private lateinit var browser: TestHttpSession
    private var id = 0

    private fun key() = UUID.randomUUID().toString()

    @BeforeEach
    fun fixtures() {
        TestData.reset(jdbc)
        val room =
            rooms.saveAndFlush(
                Apartment(capacity = 4, baseRateCents = 5001, propertyId = "villa-rosa")
            )
        val guest =
            guests.saveAndFlush(
                Customer(firstName = "Synthetic", lastName = "Ledger", propertyId = "villa-rosa")
            )
        val quote = quotes.create(room.id!!, "2030-01-01", "2030-01-03", 2)
        id =
            inventory
                .createQuoted(
                    guest.id!!,
                    quote.id,
                    room.id!!,
                    quote.startDate,
                    quote.endDate,
                    2,
                    key(),
                )
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

    private fun body(amount: String = "2501", version: String = "0", method: String = "\"CASH\"") =
        """{"amountCents":$amount,"expectedVersion":$version,"method":$method,"effectiveDate":"${time.today()}"}"""

    @Test
    fun ownerRecordsAndReconcilesExactExternalFunds() {
        val stable = key()
        repeat(2) {
            postBody("/api/v1/reservations/$id/ledger/payments", body(), stable)
                .andExpect(status().isOk)
                .andExpect(jsonPath("$.ledgerEntry.amountCents").value(2501))
                .andExpect(jsonPath("$.ledgerEntry.id").isString)
                .andExpect(jsonPath("$.reservation.version").value(1))
        }
        mvc.perform(get("/api/v1/reservations/$id/ledger").cookie(browser.cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.totals.receivedCents").value(2501))
            .andExpect(jsonPath("$.agreedCents").value(10002))
        mvc.perform(get("/api/v1/reservations/$id/ledger/entries").cookie(browser.cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.items.length()").value(1))
    }

    @ParameterizedTest
    @ValueSource(strings = ["null", "0", "-1", "0.5", "\"1\"", "9007199254740992"])
    fun paymentAmountsAreRequiredExactPositiveSafeCents(amount: String) {
        postBody("/api/v1/reservations/$id/ledger/payments", body(amount = amount))
            .andExpect(status().isBadRequest)
    }

    @ParameterizedTest
    @ValueSource(strings = ["null", "-1", "0.5", "\"0\"", "9007199254740992"])
    fun financialWritesRequireAReviewedExactVersion(version: String) {
        postBody("/api/v1/reservations/$id/ledger/payments", body(version = version))
            .andExpect(status().isBadRequest)
    }

    @Test
    fun numericMethodsAndMissingFinancialFieldsAreRejected() {
        postBody("/api/v1/reservations/$id/ledger/payments", body(method = "0"))
            .andExpect(status().isBadRequest)
        postBody("/api/v1/reservations/$id/ledger/payments", "{}").andExpect(status().isBadRequest)
        postBody("/api/v1/reservations/$id/ledger/refunds", "{}").andExpect(status().isBadRequest)
        postBody("/api/v1/reservations/$id/ledger/entries/1/reversal", "{}")
            .andExpect(status().isBadRequest)
    }

    @Test
    fun numericLinkedReceiptCannotRoundToAnotherReceipt() {
        jdbc.execute("ALTER TABLE ledger_entries ALTER COLUMN id RESTART WITH 9007199254741000")
        postBody("/api/v1/reservations/$id/ledger/payments", body(amount = "100", version = "0"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.ledgerEntry.id").value("9007199254741000"))
        postBody("/api/v1/reservations/$id/ledger/payments", body(amount = "200", version = "1"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.ledgerEntry.id").value("9007199254741001"))
        for (numeric in listOf("9007199254741000", "9007199254741000.0", "true")) {
            postBody(
                    "/api/v1/reservations/$id/ledger/refunds",
                    """{"paymentId":$numeric,"amountCents":25,"expectedVersion":2,"method":"CASH","effectiveDate":"${time.today()}","reason":"Synthetic precision probe"}""",
                )
                .andExpect(status().isBadRequest)
        }
        mvc.perform(get("/api/v1/reservations/$id/ledger").cookie(browser.cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.totals.refundsCents").value(0))
            .andExpect(jsonPath("$.reservation.version").value(2))
        postBody(
                "/api/v1/reservations/$id/ledger/refunds",
                """{"paymentId":"9007199254741001","amountCents":25,"expectedVersion":2,"method":"CASH","effectiveDate":"${time.today()}","reason":"Synthetic exact receipt"}""",
            )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.ledgerEntry.paymentId").value("9007199254741001"))
    }

    @ParameterizedTest
    @ValueSource(strings = ["100", "1.5", "true"])
    fun receiptReferencesMustBeJsonStrings(reference: String) {
        val request = body().dropLast(1) + ",\"reference\":" + reference + "}"
        postBody("/api/v1/reservations/$id/ledger/payments", request)
            .andExpect(status().isBadRequest)
    }

    @Test
    fun financialReadsAndWritesNeverAllowAnonymousOrUnapprovedRoles() {
        for (path in listOf("/ledger", "/ledger/entries", "/ledger/payments")) {
            mvc.perform(get("/api/v1/reservations/$id$path")).andExpect(status().isUnauthorized)
            mvc.perform(
                    get("/api/v1/reservations/$id$path")
                        .with(user("housekeeping").roles("HOUSEKEEPING"))
                )
                .andExpect(status().isForbidden)
        }
        for (path in listOf("/ledger/payments", "/ledger/refunds", "/ledger/entries/1/reversal")) {
            mvc.perform(
                    post("/api/v1/reservations/$id$path")
                        .contentType("application/json")
                        .content(body())
                )
                .andExpect(status().isUnauthorized)
            mvc.perform(
                    post("/api/v1/reservations/$id$path")
                        .cookie(browser.cookie)
                        .contentType("application/json")
                        .content(body())
                )
                .andExpect(status().isForbidden)
        }
        postBody("/api/v1/reservations/$id/ledger/payments", body(), "invalid")
            .andExpect(status().isBadRequest)
    }
}
