package com.villarosa.security

import com.villarosa.ReleasePaths
import com.villarosa.exception.DomainException
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import java.time.Clock
import org.springframework.security.authentication.AnonymousAuthenticationToken
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.web.filter.OncePerRequestFilter

class StaffSessionFilter(
    private val settings: AuthenticationSettings,
    private val access: StaffAccess,
    private val clock: Clock,
) : OncePerRequestFilter() {
    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        chain: FilterChain,
    ) {
        if (ReleasePaths.matches(request)) {
            response.setHeader("Cache-Control", "no-store")
            chain.doFilter(request, response)
            return
        }
        val authentication = SecurityContextHolder.getContext().authentication
        if (authentication is StaffAuthentication) {
            val session = request.getSession(false)
            if (session == null) {
                SecurityContextHolder.clearContext()
                return failure(response, 401, "SESSION_REVOKED")
            }
            val now = clock.millis()
            val created = session.getAttribute(AUTHENTICATED_AT) as? Long
            val seen = session.getAttribute(LAST_SEEN_AT) as? Long
            if (
                created == null ||
                    seen == null ||
                    now >= created + AuthenticationSettings.ABSOLUTE_LIMIT.toMillis() ||
                    now >= seen + AuthenticationSettings.IDLE_LIMIT.toMillis()
            ) {
                session?.invalidate()
                SecurityContextHolder.clearContext()
                return failure(response, 401, "SESSION_EXPIRED")
            }
            try {
                access.person(authentication.identity)
            } catch (_: DomainException) {
                session.invalidate()
                SecurityContextHolder.clearContext()
                return failure(response, 401, "SESSION_REVOKED")
            }
            val path = request.requestURI.removePrefix(request.contextPath)
            if (
                !path.startsWith("/api/v1/auth/") &&
                    !path.startsWith("/api/v1/businesses/") &&
                    path !in setOf("/oauth2/authorization/google", "/login/oauth2/code/google")
            ) {
                if (
                    request.getHeader("X-Villas-Business")?.let {
                        it != com.villarosa.service.PropertyScope.ID
                    } == true
                )
                    return failure(response, 403, "BUSINESS_ACCESS_DENIED")
                try {
                    access.resolve(authentication.identity, com.villarosa.service.PropertyScope.ID)
                } catch (_: DomainException) {
                    return failure(response, 401, "SESSION_REVOKED")
                }
            }
            if (
                request.method !in SAFE_METHODS &&
                    request.getHeader("Origin") != settings.publicOrigin
            )
                return failure(response, 403, "ORIGIN_DENIED")
            session.setAttribute(LAST_SEEN_AT, now)
        } else if (
            authentication != null &&
                authentication.isAuthenticated &&
                authentication !is AnonymousAuthenticationToken
        ) {
            return failure(response, 403, "ACCESS_DENIED")
        } else {
            if (!publicRequest(request)) return failure(response, 401, "AUTHENTICATION_REQUIRED")
            request.getSession(false)?.maxInactiveInterval =
                AuthenticationSettings.PREAUTH_LIMIT.seconds.toInt()
        }
        response.setHeader("Cache-Control", "no-store")
        chain.doFilter(request, response)
    }

    private fun publicRequest(request: HttpServletRequest): Boolean {
        if (request.method != "GET") return false
        val path = request.requestURI.removePrefix(request.contextPath)
        return path in
            setOf(
                "/api/v1/auth/session",
                "/oauth2/authorization/google",
                "/login/oauth2/code/google",
            ) ||
            (settings.mode != "production" &&
                (path.startsWith("/v3/api-docs") || path.startsWith("/swagger-ui")))
    }

    private fun failure(response: HttpServletResponse, status: Int, code: String) {
        response.status = status
        response.contentType = "application/json"
        response.setHeader("Cache-Control", "no-store")
        response.writer.write("""{"code":"$code","message":"Sign in again to continue."}""")
    }

    companion object {
        const val GENERATION = "villas.sessionGeneration"
        const val AUTHENTICATED_AT = "villas.authenticatedAt"
        const val LAST_SEEN_AT = "villas.lastSeenAt"
        private val SAFE_METHODS = setOf("GET", "HEAD", "OPTIONS", "TRACE")
    }
}
