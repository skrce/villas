package com.villarosa.security

import com.villarosa.exception.DomainException
import org.springframework.http.HttpStatus
import org.springframework.security.authentication.AbstractAuthenticationToken
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.stereotype.Component

class StaffAuthentication(val identity: StaffSessionIdentity) :
    AbstractAuthenticationToken(listOf(SimpleGrantedAuthority("ROLE_STAFF"))) {
    init {
        isAuthenticated = true
    }

    override fun getPrincipal(): Any = identity

    override fun getCredentials(): Any? = null

    override fun getName(): String = identity.id

    companion object {
        private const val serialVersionUID = 2L
    }
}

@Component
class CurrentStaff {
    fun optional(): StaffIdentity? = if (optionalSession() == null) null else identity()

    fun optionalSession(): StaffSessionIdentity? =
        (SecurityContextHolder.getContext().authentication as? StaffAuthentication)?.identity

    fun session(): StaffSessionIdentity =
        optionalSession()
            ?: throw DomainException(
                "AUTHENTICATION_REQUIRED",
                HttpStatus.UNAUTHORIZED,
                "Sign in to continue.",
            )

    fun identity(): StaffIdentity {
        val login = session()
        val context = BusinessScope.require()
        val grant = login.memberships[context.id]
        if (
            context.actor.personId != login.id ||
                context.actor.personVersion != login.securityVersion ||
                grant?.id != context.actor.id ||
                grant.securityVersion != context.actor.securityVersion
        ) {
            throw DomainException(
                "BUSINESS_ACCESS_DENIED",
                HttpStatus.FORBIDDEN,
                "This business is unavailable for your account.",
            )
        }
        return context.actor
    }
}
