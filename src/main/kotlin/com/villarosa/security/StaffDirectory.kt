package com.villarosa.security

import com.villarosa.exception.DomainException
import com.villarosa.exception.conflict
import com.villarosa.exception.invalid
import com.villarosa.exception.missing
import com.villarosa.service.PropertyScope
import java.time.Clock
import java.time.Duration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.data.domain.PageRequest
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional

@Configuration(proxyBeanMethods = false)
class ClockConfiguration {
    @Bean fun applicationClock(): Clock = Clock.systemUTC()
}

@Service
@Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
class StaffDirectory(
    private val locks: StaffLockRepository,
    private val staff: StaffRepository,
    private val invitations: InvitationRepository,
    private val events: StaffEventRepository,
    private val access: StaffAccess,
    private val clock: Clock,
) {
    fun bootstrap(email: String, replacePending: Boolean = false): InvitationView {
        propertyLock()
        if (staff.countByPropertyId(PropertyScope.ID) != 0L)
            conflict("OWNER_ALREADY_CONFIGURED", "Initial owner setup is already complete.")
        val normalized = email(email)
        val pending = pending(normalized)
        if (pending != null) return pending.view()
        if (
            !replacePending &&
                invitations.existsByPropertyIdAndStateAndExpiresAtAfter(
                    PropertyScope.ID,
                    InvitationState.PENDING,
                    clock.instant(),
                )
        )
            conflict("OWNER_ALREADY_CONFIGURED", "An initial owner invitation already exists.")
        if (replacePending) {
            val pending =
                invitations.findByPropertyIdAndStateAndExpiresAtAfter(
                    PropertyScope.ID,
                    InvitationState.PENDING,
                    clock.instant(),
                    PageRequest.of(0, 100),
                )
            for (previous in pending) {
                previous.state = InvitationState.REVOKED
                invitations.saveAndFlush(previous)
                audit(null, "BOOTSTRAP_REPLACED", "INVITATION", previous.id)
            }
        }
        return inviteRecord(normalized, null, "OWNER_BOOTSTRAP").view()
    }

    fun invite(actor: StaffIdentity, suppliedEmail: String): InvitationView {
        propertyLock()
        val owner = access.lockOwner(actor)
        val email = email(suppliedEmail)
        if (staff.findByPropertyIdAndEmail(PropertyScope.ID, email)?.active == true)
            conflict("STAFF_ALREADY_ACTIVE", "An active staff account already uses this email.")
        val pending = pending(email)
        if (pending != null) return pending.view()
        return inviteRecord(email, owner.id, "INVITED").view()
    }

    fun revokeInvitation(actor: StaffIdentity, id: String, expected: Long): InvitationView {
        propertyLock()
        access.lockOwner(actor)
        val invite =
            invitations.findByPropertyIdAndId(PropertyScope.ID, id)
                ?: missing("Invitation does not exist.")
        version(invite.version, expected)
        if (invite.state == InvitationState.PENDING) {
            invite.state = InvitationState.REVOKED
            invitations.saveAndFlush(invite)
            audit(actor.id, "INVITATION_REVOKED", "INVITATION", invite.id)
        }
        return invite.view()
    }

    fun accept(verified: VerifiedStaffIdentity): StaffAccount {
        if (
            !verified.emailVerified ||
                verified.issuer.isBlank() ||
                verified.issuer.length > 255 ||
                verified.subject.isBlank() ||
                verified.subject.length > 255
        )
            denied()
        val email = email(verified.email)
        propertyLock()
        val existing =
            staff.findByPropertyIdAndIssuerAndSubject(
                PropertyScope.ID,
                verified.issuer,
                verified.subject,
            )
        if (existing != null && existing.active) {
            if (existing.email != email) {
                if (staff.findByPropertyIdAndEmail(PropertyScope.ID, email) != null) denied()
                existing.email = email
                existing.securityVersion = Math.incrementExact(existing.securityVersion)
                staff.saveAndFlush(existing)
                audit(existing.id, "STAFF_EMAIL_CHANGED", "STAFF", existing.id)
            }
            return existing
        }
        val emailAccount = staff.findByPropertyIdAndEmail(PropertyScope.ID, email)
        if (emailAccount != null && emailAccount.id != existing?.id) denied()
        val invitation = pending(email) ?: denied()
        val account =
            if (existing == null) {
                staff.saveAndFlush(
                    StaffAccount(
                        issuer = verified.issuer,
                        subject = verified.subject,
                        email = email,
                        createdAt = clock.instant(),
                    )
                )
            } else {
                existing.active = true
                existing.email = email
                existing.securityVersion = Math.incrementExact(existing.securityVersion)
                staff.saveAndFlush(existing)
            }
        invitation.state = InvitationState.ACCEPTED
        invitation.acceptedBy = account.id
        invitations.saveAndFlush(invitation)
        audit(account.id, "INVITATION_ACCEPTED", "INVITATION", invitation.id)
        return account
    }

    fun deactivate(actor: StaffIdentity, id: String, expected: Long): StaffView {
        propertyLock()
        access.lockOwner(actor)
        val target = staff.locked(PropertyScope.ID, id) ?: missing("Staff account does not exist.")
        version(target.version, expected)
        if (target.active) {
            if (staff.countByPropertyIdAndActiveTrue(PropertyScope.ID) <= 1L)
                conflict("LAST_OWNER", "At least one active owner must remain.")
            target.active = false
            target.securityVersion = Math.incrementExact(target.securityVersion)
            staff.saveAndFlush(target)
            audit(actor.id, "STAFF_DEACTIVATED", "STAFF", target.id)
        }
        return target.view()
    }

    fun revokeSessions(actor: StaffIdentity, id: String, expected: Long): StaffView {
        propertyLock()
        access.lockOwner(actor)
        val target = staff.locked(PropertyScope.ID, id) ?: missing("Staff account does not exist.")
        version(target.version, expected)
        target.securityVersion = Math.incrementExact(target.securityVersion)
        staff.saveAndFlush(target)
        audit(actor.id, "SESSIONS_REVOKED", "STAFF", target.id)
        return target.view()
    }

    fun accounts(actor: StaffIdentity): List<StaffView> {
        access.current(actor)
        return staff
            .findByPropertyIdOrderByCreatedAtAscIdAsc(PropertyScope.ID, PageRequest.of(0, 100))
            .map { it.view() }
    }

    fun pendingInvitations(actor: StaffIdentity): List<InvitationView> {
        access.current(actor)
        return invitations
            .findByPropertyIdAndStateOrderByCreatedAtDescIdDesc(
                PropertyScope.ID,
                InvitationState.PENDING,
                PageRequest.of(0, 100),
            )
            .filter { it.expiresAt > clock.instant() }
            .map { it.view() }
    }

    private fun pending(email: String): StaffInvitation? {
        val matches =
            invitations.findByPropertyIdAndEmailAndStateOrderByCreatedAtDesc(
                PropertyScope.ID,
                email,
                InvitationState.PENDING,
            )
        for (invitation in matches) {
            if (invitation.expiresAt > clock.instant()) return invitation
            invitation.state = InvitationState.EXPIRED
            invitations.saveAndFlush(invitation)
        }
        return null
    }

    private fun inviteRecord(email: String, actor: String?, kind: String): StaffInvitation {
        val now = clock.instant()
        val saved =
            invitations.saveAndFlush(
                StaffInvitation(
                    email = email,
                    createdBy = actor,
                    createdAt = now,
                    expiresAt = now.plus(INVITATION_TTL),
                )
            )
        audit(actor, kind, "INVITATION", saved.id)
        return saved
    }

    private fun audit(actor: String?, kind: String, type: String, id: String) {
        events.saveAndFlush(
            StaffEvent(
                actorId = actor,
                kind = kind,
                subjectType = type,
                subjectId = id,
                occurredAt = clock.instant(),
            )
        )
    }

    private fun propertyLock() {
        checkNotNull(locks.locked(PropertyScope.ID)) {
            "Staff metadata requires an explicit schema migration."
        }
    }

    private fun version(actual: Long, expected: Long) {
        if (expected < 0) invalid("INVALID_VERSION", "Version must not be negative.")
        if (actual != expected)
            conflict("STALE_VERSION", "The record changed. Reload it before editing.")
    }

    private fun denied(): Nothing =
        throw DomainException(
            "STAFF_NOT_ALLOWED",
            HttpStatus.FORBIDDEN,
            "This Google account is not permitted to sign in.",
        )

    companion object {
        val INVITATION_TTL: Duration = Duration.ofDays(3)
        private val emailShape = Regex("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")

        fun email(value: String): String {
            val normalized = value.trim().lowercase(java.util.Locale.ROOT)
            if (
                normalized.length > 254 ||
                    normalized.any { it.isWhitespace() || it.isISOControl() } ||
                    !emailShape.matches(normalized)
            )
                invalid("INVALID_EMAIL", "Enter a valid email address.")
            return normalized
        }
    }
}
