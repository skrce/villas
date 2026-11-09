package com.villarosa.security

import com.villarosa.exception.DomainException
import com.villarosa.service.PropertyScope
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional

@Service
class StaffAccess(
    private val staff: StaffRepository,
    private val people: GoogleIdentityRepository,
    private val businesses: BusinessRepository,
    private val entities: jakarta.persistence.EntityManager,
) {
    @Transactional(propagation = Propagation.MANDATORY)
    fun lockOwner(identity: StaffIdentity, businessId: String = PropertyScope.ID): StaffAccount {
        val person = identity.personId?.let { people.locked(it) ?: revoked() }
        validatePerson(person, identity.personVersion)
        if (!lockBusiness(businessId)) revoked()
        return validate(staff.locked(businessId, identity.id), identity, businessId, person)
    }

    @Transactional(propagation = Propagation.MANDATORY)
    fun lockBusiness(businessId: String): Boolean {
        val business = businesses.findById(businessId).orElse(null) ?: return false
        entities.refresh(business, jakarta.persistence.LockModeType.PESSIMISTIC_READ)
        return business.active
    }

    @Transactional(readOnly = true)
    fun current(identity: StaffIdentity, businessId: String = PropertyScope.ID): StaffAccount {
        val person = identity.personId?.let { people.findById(it).orElse(null) ?: revoked() }
        validatePerson(person, identity.personVersion)
        return validate(
            staff.findByPropertyIdAndId(businessId, identity.id),
            identity,
            businessId,
            person,
        )
    }

    @Transactional(readOnly = true)
    fun person(session: StaffSessionIdentity): GoogleIdentity =
        (people.findById(session.id).orElse(null) ?: revoked()).also {
            if (it.securityVersion != session.securityVersion) revoked()
        }

    @Transactional(readOnly = true)
    fun resolve(session: StaffSessionIdentity, businessId: String): StaffIdentity {
        BusinessIds.requireValid(businessId)
        person(session)
        val grant = session.memberships[businessId] ?: denied()
        val identity = grant.copy(personId = session.id, personVersion = session.securityVersion)
        try {
            current(identity, businessId)
        } catch (_: DomainException) {
            denied()
        }
        return identity
    }

    @Transactional(readOnly = true)
    fun memberships(session: StaffSessionIdentity): List<BusinessMembershipView> {
        person(session)
        return session.memberships.keys.sorted().mapNotNull { businessId ->
            try {
                val identity = resolve(session, businessId)
                val business = businesses.findById(businessId).orElseThrow()
                BusinessMembershipView(
                    business.id,
                    business.name,
                    current(identity, businessId).view(),
                )
            } catch (_: DomainException) {
                null
            }
        }
    }

    private fun validatePerson(person: GoogleIdentity?, expected: Long?) {
        if (person != null && person.securityVersion != expected) revoked()
    }

    private fun validate(
        account: StaffAccount?,
        identity: StaffIdentity,
        businessId: String,
        person: GoogleIdentity?,
    ): StaffAccount {
        if (
            account == null ||
                !account.active ||
                account.securityVersion != identity.securityVersion ||
                businesses.findById(businessId).orElse(null)?.active != true ||
                (person != null &&
                    (account.issuer != person.issuer || account.subject != person.subject))
        )
            revoked()
        return account
    }

    private fun revoked(): Nothing =
        throw DomainException(
            "SESSION_REVOKED",
            HttpStatus.UNAUTHORIZED,
            "Sign in again to continue.",
        )

    private fun denied(): Nothing =
        throw DomainException(
            "BUSINESS_ACCESS_DENIED",
            HttpStatus.FORBIDDEN,
            "This business is unavailable for your account.",
        )
}
