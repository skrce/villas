package com.villarosa.security

import com.villarosa.exception.DomainException
import java.time.Clock
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional

@Service
class SharedIdentities(
    private val coordination: IdentityCoordinationRepository,
    private val people: GoogleIdentityRepository,
    private val access: StaffAccess,
    private val locks: StaffLockRepository,
    private val staff: StaffRepository,
    private val invitations: InvitationRepository,
    private val events: StaffEventRepository,
    private val clock: Clock,
    private val database: DatabaseScope,
) {
    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    fun signIn(
        verified: VerifiedStaffIdentity,
        requiredBusiness: String? = null,
    ): StaffSessionIdentity {
        if (
            !verified.emailVerified ||
                verified.issuer.isBlank() ||
                verified.issuer.length > 255 ||
                verified.subject.isBlank() ||
                verified.subject.length > 255
        )
            denied()
        val email = StaffDirectory.email(verified.email)
        database.admission(verified)
        checkNotNull(coordination.locked()) {
            "Shared identity requires an explicit schema migration."
        }
        val existing = people.findByIssuerAndSubject(verified.issuer, verified.subject)
        val candidates =
            (staff.businessIds(verified.issuer, verified.subject) + invitations.businessIds(email))
                .distinct()
                .sorted()
        for (businessId in candidates) checkNotNull(locks.locked(businessId))
        val person =
            existing?.let { checkNotNull(people.locked(it.id)) }
                ?: GoogleIdentity(
                    issuer = verified.issuer,
                    subject = verified.subject,
                    email = email,
                    createdAt = clock.instant(),
                )
        val activeBusinesses = candidates.filter { access.lockBusiness(it) }
        val memberships =
            staff.findByIssuerAndSubjectOrderByPropertyIdAsc(verified.issuer, verified.subject)
        val accepted = mutableMapOf<String, StaffIdentity>()
        val renamed = person.email != email
        if (renamed) {
            for (account in memberships.filter { it.active && it.propertyId in activeBusinesses }) {
                val conflict = staff.findByPropertyIdAndEmail(account.propertyId, email)
                if (conflict != null && conflict.id != account.id) denied()
            }
            person.email = email
            person.securityVersion = Math.incrementExact(person.securityVersion)
        }
        people.saveAndFlush(person)
        for (businessId in activeBusinesses) {
            val account = memberships.find { it.propertyId == businessId }
            val emailAccount = staff.findByPropertyIdAndEmail(businessId, email)
            if (emailAccount != null && emailAccount.id != account?.id) continue
            val invite =
                invitations
                    .findByPropertyIdAndEmailAndStateOrderByCreatedAtDesc(
                        businessId,
                        email,
                        InvitationState.PENDING,
                    )
                    .firstOrNull { it.expiresAt > clock.instant() }
            if (account?.active != true && invite == null) continue
            val membership =
                account
                    ?: StaffAccount(
                        propertyId = businessId,
                        issuer = person.issuer,
                        subject = person.subject,
                        email = email,
                        createdAt = clock.instant(),
                    )
            val reactivated = !membership.active
            val emailChanged = membership.email != email
            if (reactivated || emailChanged)
                membership.securityVersion = Math.incrementExact(membership.securityVersion)
            membership.active = true
            membership.email = email
            staff.saveAndFlush(membership)
            if (emailChanged)
                audit(businessId, membership.id, "STAFF_EMAIL_CHANGED", "STAFF", membership.id)
            if (invite != null) {
                invite.state = InvitationState.ACCEPTED
                invite.acceptedBy = membership.id
                invitations.saveAndFlush(invite)
                audit(businessId, membership.id, "INVITATION_ACCEPTED", "INVITATION", invite.id)
            }
            accepted[businessId] = membership.identity()
        }
        if (accepted.isEmpty() || (requiredBusiness != null && requiredBusiness !in accepted))
            denied()
        return StaffSessionIdentity(person.id, person.securityVersion, accepted.toMap())
    }

    private fun audit(businessId: String, actorId: String, kind: String, type: String, id: String) {
        events.saveAndFlush(
            StaffEvent(
                propertyId = businessId,
                actorId = actorId,
                kind = kind,
                subjectType = type,
                subjectId = id,
                occurredAt = clock.instant(),
            )
        )
    }

    private fun denied(): Nothing =
        throw DomainException(
            "STAFF_NOT_ALLOWED",
            HttpStatus.FORBIDDEN,
            "This Google account is not permitted to sign in.",
        )
}
