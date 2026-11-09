package com.villarosa.security

import com.villarosa.exception.DomainException
import com.villarosa.exception.conflict
import com.villarosa.exception.invalid
import com.villarosa.exception.missing
import java.time.Clock
import java.time.Duration
import java.time.temporal.ChronoUnit
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
    private val shared: SharedIdentities,
    private val database: DatabaseScope,
) {
    fun bootstrap(
        email: String,
        replacePending: Boolean = false,
        businessId: String,
    ): InvitationView {
        propertyLock(businessId)
        if (!access.lockBusiness(businessId))
            throw DomainException(
                "BUSINESS_ACCESS_DENIED",
                HttpStatus.FORBIDDEN,
                "This business is unavailable.",
            )
        if (staff.countByPropertyId(businessId) != 0L)
            conflict("OWNER_ALREADY_CONFIGURED", "Initial owner setup is already complete.")
        val normalized = email(email)
        val pending = pending(normalized, businessId)
        if (pending != null) return pending.view()
        if (
            !replacePending &&
                invitations.existsByPropertyIdAndStateAndExpiresAtAfter(
                    businessId,
                    InvitationState.PENDING,
                    clock.instant().truncatedTo(ChronoUnit.MICROS),
                )
        )
            conflict("OWNER_ALREADY_CONFIGURED", "An initial owner invitation already exists.")
        if (replacePending) {
            val pending =
                invitations.findByPropertyIdAndStateAndExpiresAtAfter(
                    businessId,
                    InvitationState.PENDING,
                    clock.instant().truncatedTo(ChronoUnit.MICROS),
                    PageRequest.of(0, 100),
                )
            for (previous in pending) {
                previous.state = InvitationState.REVOKED
                invitations.saveAndFlush(previous)
                audit(null, "BOOTSTRAP_REPLACED", "INVITATION", previous.id, businessId)
            }
        }
        return inviteRecord(normalized, null, "OWNER_BOOTSTRAP", businessId).view()
    }

    fun recover(suppliedEmail: String, businessId: String): InvitationView {
        propertyLock(businessId)
        if (!access.lockBusiness(businessId))
            throw DomainException(
                "BUSINESS_ACCESS_DENIED",
                HttpStatus.FORBIDDEN,
                "This business is unavailable.",
            )
        val normalized = email(suppliedEmail)
        if (staff.findByPropertyIdAndEmail(businessId, normalized)?.active == true)
            conflict("STAFF_ALREADY_ACTIVE", "This active account can sign in through Google.")
        return (pending(normalized, businessId)
                ?: inviteRecord(normalized, null, "OWNER_RECOVERY", businessId))
            .view()
    }

    fun invite(
        actor: StaffIdentity,
        suppliedEmail: String,
        businessId: String = BusinessScope.id(),
    ): InvitationView {
        database.business(businessId, actor)
        propertyLock(businessId)
        val owner = access.lockOwner(actor, businessId)
        val email = email(suppliedEmail)
        if (staff.findByPropertyIdAndEmail(businessId, email)?.active == true)
            conflict("STAFF_ALREADY_ACTIVE", "An active staff account already uses this email.")
        val pending = pending(email, businessId)
        if (pending != null) return pending.view()
        return inviteRecord(email, owner.id, "INVITED", businessId).view()
    }

    fun revokeInvitation(
        actor: StaffIdentity,
        id: String,
        expected: Long,
        businessId: String = BusinessScope.id(),
    ): InvitationView {
        database.business(businessId, actor)
        propertyLock(businessId)
        access.lockOwner(actor, businessId)
        val invite =
            invitations.findByPropertyIdAndId(businessId, id)
                ?: missing("Invitation does not exist.")
        version(invite.version, expected)
        if (invite.state == InvitationState.PENDING) {
            invite.state = InvitationState.REVOKED
            invitations.saveAndFlush(invite)
            audit(actor.id, "INVITATION_REVOKED", "INVITATION", invite.id, businessId)
        }
        return invite.view()
    }

    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    fun accept(verified: VerifiedStaffIdentity, businessId: String): StaffAccount {
        val session = shared.signIn(verified, requiredBusiness = businessId)
        return access.current(access.resolve(session, businessId), businessId)
    }

    fun deactivate(
        actor: StaffIdentity,
        id: String,
        expected: Long,
        businessId: String = BusinessScope.id(),
    ): StaffView {
        database.business(businessId, actor)
        propertyLock(businessId)
        access.lockOwner(actor, businessId)
        val target = staff.locked(businessId, id) ?: missing("Staff account does not exist.")
        version(target.version, expected)
        if (target.active) {
            if (staff.countByPropertyIdAndActiveTrue(businessId) <= 1L)
                conflict("LAST_OWNER", "At least one active owner must remain.")
            target.active = false
            target.securityVersion = Math.incrementExact(target.securityVersion)
            staff.saveAndFlush(target)
            audit(actor.id, "STAFF_DEACTIVATED", "STAFF", target.id, businessId)
        }
        return target.view()
    }

    fun revokeSessions(
        actor: StaffIdentity,
        id: String,
        expected: Long,
        businessId: String = BusinessScope.id(),
    ): StaffView {
        database.business(businessId, actor)
        propertyLock(businessId)
        access.lockOwner(actor, businessId)
        val target = staff.locked(businessId, id) ?: missing("Staff account does not exist.")
        version(target.version, expected)
        target.securityVersion = Math.incrementExact(target.securityVersion)
        staff.saveAndFlush(target)
        audit(actor.id, "SESSIONS_REVOKED", "STAFF", target.id, businessId)
        return target.view()
    }

    fun accounts(actor: StaffIdentity, businessId: String = BusinessScope.id()): List<StaffView> {
        access.current(actor, businessId)
        return staff
            .findByPropertyIdOrderByCreatedAtAscIdAsc(businessId, PageRequest.of(0, 100))
            .map { it.view() }
    }

    fun pendingInvitations(
        actor: StaffIdentity,
        businessId: String = BusinessScope.id(),
    ): List<InvitationView> {
        access.current(actor, businessId)
        return invitations
            .findByPropertyIdAndStateOrderByCreatedAtDescIdDesc(
                businessId,
                InvitationState.PENDING,
                PageRequest.of(0, 100),
            )
            .filter { it.expiresAt > clock.instant() }
            .map { it.view() }
    }

    private fun pending(email: String, businessId: String): StaffInvitation? {
        val matches =
            invitations.findByPropertyIdAndEmailAndStateOrderByCreatedAtDesc(
                businessId,
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

    private fun inviteRecord(
        email: String,
        actor: String?,
        kind: String,
        businessId: String,
    ): StaffInvitation {
        val now = clock.instant().truncatedTo(ChronoUnit.MICROS)
        val saved =
            invitations.saveAndFlush(
                StaffInvitation(
                    propertyId = businessId,
                    email = email,
                    createdBy = actor,
                    createdAt = now,
                    expiresAt = now.plus(INVITATION_TTL),
                )
            )
        audit(actor, kind, "INVITATION", saved.id, businessId)
        return saved
    }

    private fun audit(actor: String?, kind: String, type: String, id: String, businessId: String) {
        events.saveAndFlush(
            StaffEvent(
                propertyId = businessId,
                actorId = actor,
                kind = kind,
                subjectType = type,
                subjectId = id,
                occurredAt = clock.instant().truncatedTo(ChronoUnit.MICROS),
            )
        )
    }

    private fun propertyLock(businessId: String) {
        BusinessIds.requireValid(businessId)
        checkNotNull(locks.locked(businessId)) {
            "Staff metadata requires an explicit schema migration."
        }
    }

    private fun version(actual: Long, expected: Long) {
        if (expected < 0) invalid("INVALID_VERSION", "Version must not be negative.")
        if (actual != expected)
            conflict("STALE_VERSION", "The record changed. Reload it before editing.")
    }

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
