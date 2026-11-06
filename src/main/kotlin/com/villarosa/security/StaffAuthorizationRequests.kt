package com.villarosa.security

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import java.time.Clock
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.oauth2.client.web.AuthorizationRequestRepository
import org.springframework.security.oauth2.client.web.HttpSessionOAuth2AuthorizationRequestRepository
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest

class StaffAuthorizationRequests(private val clock: Clock) :
    AuthorizationRequestRepository<OAuth2AuthorizationRequest> {
    private val delegate = HttpSessionOAuth2AuthorizationRequestRepository()

    override fun saveAuthorizationRequest(
        value: OAuth2AuthorizationRequest,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ) {
        val session = request.getSession(true)
        session.setAttribute(STARTED_AT, clock.millis())
        if (SecurityContextHolder.getContext().authentication !is StaffAuthentication)
            session.maxInactiveInterval = AuthenticationSettings.PREAUTH_LIMIT.seconds.toInt()
        delegate.saveAuthorizationRequest(value, request, response)
    }

    override fun loadAuthorizationRequest(
        request: HttpServletRequest
    ): OAuth2AuthorizationRequest? =
        if (valid(request)) delegate.loadAuthorizationRequest(request) else null

    override fun removeAuthorizationRequest(
        request: HttpServletRequest,
        response: HttpServletResponse,
    ): OAuth2AuthorizationRequest? {
        val valid = valid(request)
        val value = delegate.removeAuthorizationRequest(request, response)
        request.getSession(false)?.removeAttribute(STARTED_AT)
        return if (valid) value else null
    }

    private fun valid(request: HttpServletRequest): Boolean {
        val started = request.getSession(false)?.getAttribute(STARTED_AT) as? Long ?: return false
        return clock.millis() < started + AuthenticationSettings.PREAUTH_LIMIT.toMillis()
    }

    companion object {
        const val STARTED_AT = "villas.oidcStartedAt"
    }
}
