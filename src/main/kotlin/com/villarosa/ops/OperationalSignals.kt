package com.villarosa.ops

import io.swagger.v3.oas.annotations.Hidden
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import java.util.concurrent.atomic.AtomicLongArray
import org.slf4j.LoggerFactory
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.stereotype.Component
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.filter.OncePerRequestFilter

enum class Signal(val metric: String) {
    REQUESTS("villas_http_requests_total"),
    AUTH_FAILURES("villas_auth_failures_total"),
    BOOKING_REJECTIONS("villas_booking_write_rejections_total"),
    BOOKING_FAILURES("villas_booking_write_failures_total"),
    DATABASE_FAILURES("villas_database_failures_total"),
    SERVICE_FAILURES("villas_service_failures_total"),
}

class SignalRegistry {
    private val counts = AtomicLongArray(Signal.entries.size)
    private val loggedAt = AtomicLongArray(Signal.entries.size)
    private val logger = LoggerFactory.getLogger("com.villarosa.ops")

    fun increment(signal: Signal) {
        counts.incrementAndGet(signal.ordinal)
        if (
            signal in
                setOf(
                    Signal.DATABASE_FAILURES,
                    Signal.SERVICE_FAILURES,
                    Signal.BOOKING_FAILURES,
                    Signal.AUTH_FAILURES,
                )
        ) {
            val now = System.currentTimeMillis()
            val last = loggedAt.get(signal.ordinal)
            if (now - last >= 30_000 && loggedAt.compareAndSet(signal.ordinal, last, now))
                logger.warn("villas_operation_failed category={}", signal.name)
        }
    }

    fun response(method: String, path: String, status: Int) {
        increment(Signal.REQUESTS)
        if (status == 401 || status == 403) increment(Signal.AUTH_FAILURES)
        if (status >= 500) increment(Signal.SERVICE_FAILURES)
        if (method !in setOf("GET", "HEAD", "OPTIONS") && path.startsWith("/api/v1/reservations")) {
            if (status >= 500) increment(Signal.BOOKING_FAILURES)
            else if (status >= 400) increment(Signal.BOOKING_REJECTIONS)
        }
    }

    fun metrics(): String =
        Signal.entries.joinToString("\n", postfix = "\n") {
            "# TYPE ${it.metric} counter\n${it.metric} ${counts.get(it.ordinal)}"
        }
}

object RuntimeSignals {
    val registry = SignalRegistry()

    fun databaseFailure() = registry.increment(Signal.DATABASE_FAILURES)

    fun authFailure() = registry.increment(Signal.AUTH_FAILURES)
}

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
class OperationalHttpFilter : OncePerRequestFilter() {
    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        chain: FilterChain,
    ) {
        if (request.requestURI == "/health" || request.requestURI.startsWith("/internal/")) {
            chain.doFilter(request, response)
            return
        }
        var failed = false
        try {
            chain.doFilter(request, response)
        } catch (exception: Exception) {
            failed = true
            throw exception
        } finally {
            RuntimeSignals.registry.response(
                request.method,
                request.requestURI,
                if (failed) 500 else response.status,
            )
        }
    }
}

@Hidden
@RestController
class OperationalMetrics {
    @GetMapping("/internal/metrics", produces = ["text/plain;version=0.0.4;charset=utf-8"])
    fun metrics(): String = RuntimeSignals.registry.metrics()
}
