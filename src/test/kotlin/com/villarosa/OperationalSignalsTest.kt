package com.villarosa

import com.villarosa.exception.ExceptionHandler
import com.villarosa.ops.Signal
import com.villarosa.ops.SignalRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.dao.DataAccessResourceFailureException

class OperationalSignalsTest {
    @Test
    fun metricsHaveFixedNamesWithoutPathsParametersOrBusinessData() {
        val signals = SignalRegistry()
        signals.response("POST", "/api/v1/reservations/123?email=private@example.test", 500)
        signals.response("POST", "/api/v1/reservations/123", 409)
        signals.response("GET", "/api/v1/customers/private-person", 401)
        signals.increment(Signal.DATABASE_FAILURES)
        assertThat(signals.metrics())
            .contains(
                "villas_http_requests_total 3",
                "villas_booking_write_failures_total 1",
                "villas_booking_write_rejections_total 1",
                "villas_auth_failures_total 1",
                "villas_database_failures_total 1",
            )
            .doesNotContain("123", "email", "private", "@", "?")
    }

    @Test
    fun unexpectedFailuresDoNotEchoDatabaseDetailsAndDoNotClaimTheSaveFailed() {
        val response =
            ExceptionHandler()
                .unexpected(
                    DataAccessResourceFailureException("private@example.test secret SQL details")
                )
        assertThat(response.statusCode.value()).isEqualTo(500)
        assertThat(response.body!!.message)
            .contains("Reconcile")
            .doesNotContain("private", "SQL", "secret")
    }
}
