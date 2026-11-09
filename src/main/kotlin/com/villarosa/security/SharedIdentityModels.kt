package com.villarosa.security

import com.villarosa.exception.invalid
import jakarta.persistence.*
import java.time.Instant
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Query

@Entity
@Table(name = "staff_identities")
class GoogleIdentity(
    @Id @Column(length = 36) val id: String = UUID.randomUUID().toString(),
    @Column(nullable = false, length = 255) val issuer: String = "",
    @Column(nullable = false, length = 255) val subject: String = "",
    @Column(nullable = false, length = 254) var email: String = "",
    @Column(name = "security_version", nullable = false) var securityVersion: Long = 0,
    @Version @Column(nullable = false) var version: Long = 0,
    @Column(name = "created_at", nullable = false) val createdAt: Instant = Instant.now(),
)

@Entity
@Table(name = "businesses")
class Business(
    @Id @Column(length = 64) val id: String = "",
    @Column(nullable = false, length = 100) val name: String = "",
    @Column(nullable = false) val active: Boolean = true,
    @Column(nullable = false, length = 3) val currency: String = "EUR",
    @Column(name = "property_timezone", nullable = false, length = 64)
    val timezone: String = "Europe/Skopje",
    @Version @Column(nullable = false) val version: Long = 0,
    @Column(name = "created_at", nullable = false) val createdAt: Instant = Instant.now(),
)

@Entity
@Table(name = "staff_identity_lock")
class IdentityCoordination(
    @Id val singleton: Short = 1,
    @Column(name = "lock_token", nullable = false) val lockToken: Short = 0,
)

interface GoogleIdentityRepository : JpaRepository<GoogleIdentity, String> {
    fun findByIssuerAndSubject(issuer: String, subject: String): GoogleIdentity?

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select i from GoogleIdentity i where i.id=:id")
    fun locked(id: String): GoogleIdentity?
}

interface BusinessRepository : JpaRepository<Business, String>

interface IdentityCoordinationRepository : JpaRepository<IdentityCoordination, Short> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select i from IdentityCoordination i where i.singleton=1")
    fun locked(): IdentityCoordination?
}

data class StaffSessionIdentity(
    val id: String,
    val securityVersion: Long,
    val memberships: Map<String, StaffIdentity>,
) : java.io.Serializable

data class IdentityView(val id: String, val email: String)

data class BusinessMembershipView(
    val businessId: String,
    val businessName: String,
    val staff: StaffView,
)

object BusinessIds {
    fun requireValid(value: String): String {
        if (!value.matches(Regex("[a-z0-9][a-z0-9-]{0,63}")))
            invalid("INVALID_BUSINESS", "Choose a valid business.")
        return value
    }
}
