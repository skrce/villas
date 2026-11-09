package com.villarosa.security

import com.villarosa.exception.DomainException
import org.springframework.http.HttpStatus

data class AuthorizedBusiness internal constructor(val id: String, val actor: StaffIdentity)

object BusinessScope {
    private val selected = ThreadLocal<AuthorizedBusiness>()

    fun require(): AuthorizedBusiness =
        selected.get()
            ?: throw DomainException(
                "BUSINESS_REQUIRED",
                HttpStatus.BAD_REQUEST,
                "Select a business for this request.",
            )

    fun id(): String = require().id

    fun <T> within(business: AuthorizedBusiness, operation: () -> T): T {
        BusinessIds.requireValid(business.id)
        val previous = selected.get()
        selected.set(business)
        try {
            return operation()
        } finally {
            if (previous == null) selected.remove() else selected.set(previous)
        }
    }

    internal fun clear() = selected.remove()

    internal fun select(business: AuthorizedBusiness) = selected.set(business)
}
