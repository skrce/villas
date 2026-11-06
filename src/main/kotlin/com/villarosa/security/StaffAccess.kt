package com.villarosa.security

import com.villarosa.exception.DomainException
import com.villarosa.service.PropertyScope
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional

@Service
class StaffAccess(private val staff: StaffRepository) {
    @Transactional(propagation = Propagation.MANDATORY)
    fun lockOwner(identity: StaffIdentity): StaffAccount =
        validate(staff.locked(PropertyScope.ID, identity.id), identity)

    @Transactional(readOnly = true)
    fun current(identity: StaffIdentity): StaffAccount =
        validate(staff.findByPropertyIdAndId(PropertyScope.ID, identity.id), identity)

    private fun validate(account: StaffAccount?, identity: StaffIdentity): StaffAccount {
        if (
            account == null ||
                !account.active ||
                account.securityVersion != identity.securityVersion
        )
            throw DomainException(
                "SESSION_REVOKED",
                HttpStatus.UNAUTHORIZED,
                "Sign in again to continue.",
            )
        return account
    }
}
