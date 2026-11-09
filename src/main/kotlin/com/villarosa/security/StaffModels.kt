package com.villarosa.security

import jakarta.persistence.*
import java.time.Instant
import java.util.UUID
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.type.SqlTypes

@Entity
@Table(name = "staff_property_lock")
class StaffPropertyLock(@Id @Column(name = "property_id", length = 64) val propertyId: String)

enum class StaffRole {
    OWNER
}

enum class InvitationState {
    PENDING,
    ACCEPTED,
    REVOKED,
    EXPIRED,
}

@Entity
@Table(name = "staff_accounts")
class StaffAccount(
    @Id @Column(length = 36) val id: String = UUID.randomUUID().toString(),
    @Column(name = "property_id", nullable = false, length = 64) val propertyId: String,
    @Column(nullable = false, length = 255) val issuer: String = "",
    @Column(nullable = false, length = 255) val subject: String = "",
    @Column(nullable = false, length = 254) var email: String = "",
    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(nullable = false, length = 16)
    val role: StaffRole = StaffRole.OWNER,
    @Column(nullable = false) var active: Boolean = true,
    @Column(name = "security_version", nullable = false) var securityVersion: Long = 0,
    @Version @Column(nullable = false) var version: Long = 0,
    @Column(name = "created_at", nullable = false) val createdAt: Instant = Instant.now(),
) {
    fun identity() = StaffIdentity(id, securityVersion)

    fun view() = StaffView(id, email, role, active, version, createdAt)
}

@Entity
@Table(name = "staff_invitations")
class StaffInvitation(
    @Id @Column(length = 36) val id: String = UUID.randomUUID().toString(),
    @Column(name = "property_id", nullable = false, length = 64) val propertyId: String,
    @Column(nullable = false, length = 254) val email: String = "",
    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(nullable = false, length = 16)
    var state: InvitationState = InvitationState.PENDING,
    @Column(name = "created_by", length = 36) val createdBy: String? = null,
    @Column(name = "accepted_by", length = 36) var acceptedBy: String? = null,
    @Column(name = "created_at", nullable = false) val createdAt: Instant = Instant.now(),
    @Column(name = "expires_at", nullable = false)
    val expiresAt: Instant = Instant.now().plusSeconds(259200),
    @Version @Column(nullable = false) var version: Long = 0,
) {
    fun view() = InvitationView(id, email, state, expiresAt, version)
}

@Entity
@Table(name = "staff_events")
class StaffEvent(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) val id: Long? = null,
    @Column(name = "property_id", nullable = false, length = 64) val propertyId: String,
    @Column(name = "actor_id", length = 36) val actorId: String? = null,
    @Column(nullable = false, length = 32) val kind: String = "",
    @Column(name = "subject_type", nullable = false, length = 16) val subjectType: String = "",
    @Column(name = "subject_id", nullable = false, length = 36) val subjectId: String = "",
    @Column(name = "occurred_at", nullable = false) val occurredAt: Instant = Instant.now(),
)

data class StaffIdentity(
    val id: String,
    val securityVersion: Long,
    val personId: String? = null,
    val personVersion: Long? = null,
) : java.io.Serializable

data class VerifiedStaffIdentity(
    val issuer: String,
    val subject: String,
    val email: String,
    val emailVerified: Boolean,
)

data class StaffView(
    val id: String,
    val email: String,
    val role: StaffRole,
    val active: Boolean,
    val version: Long,
    val createdAt: Instant,
)

data class InvitationView(
    val id: String,
    val email: String,
    val state: InvitationState,
    val expiresAt: Instant,
    val version: Long,
)
