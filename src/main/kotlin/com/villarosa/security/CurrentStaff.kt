package com.villarosa.security

import com.villarosa.exception.DomainException
import org.springframework.http.HttpStatus
import org.springframework.security.authentication.AbstractAuthenticationToken
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.stereotype.Component

class StaffAuthentication(val identity: StaffIdentity) :
    AbstractAuthenticationToken(listOf(SimpleGrantedAuthority("ROLE_OWNER"))) {
    init {
        isAuthenticated = true
    }

    override fun getPrincipal(): Any = identity

    override fun getCredentials(): Any? = null

    override fun getName(): String = identity.id

    companion object {
        private const val serialVersionUID = 1L
    }
}

@Component
class CurrentStaff {
    fun optional(): StaffIdentity? =
        (SecurityContextHolder.getContext().authentication as? StaffAuthentication)?.identity

    fun identity(): StaffIdentity =
        optional()
            ?: throw DomainException(
                "AUTHENTICATION_REQUIRED",
                HttpStatus.UNAUTHORIZED,
                "Sign in to continue.",
            )
}
