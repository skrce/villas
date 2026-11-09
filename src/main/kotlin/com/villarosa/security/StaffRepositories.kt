package com.villarosa.security

import jakarta.persistence.LockModeType
import java.time.Instant
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Query

interface StaffLockRepository : JpaRepository<StaffPropertyLock, String> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from StaffPropertyLock p where p.propertyId=:property")
    fun locked(property: String): StaffPropertyLock?
}

interface StaffRepository : JpaRepository<StaffAccount, String> {
    @Query("select s.propertyId from StaffAccount s where s.issuer=:issuer and s.subject=:subject")
    fun businessIds(issuer: String, subject: String): List<String>

    fun findByIssuerAndSubjectOrderByPropertyIdAsc(
        issuer: String,
        subject: String,
    ): List<StaffAccount>

    fun findByPropertyIdAndId(propertyId: String, id: String): StaffAccount?

    fun findByPropertyIdAndIssuerAndSubject(
        propertyId: String,
        issuer: String,
        subject: String,
    ): StaffAccount?

    fun findByPropertyIdAndEmail(propertyId: String, email: String): StaffAccount?

    fun countByPropertyIdAndActiveTrue(propertyId: String): Long

    fun countByPropertyId(propertyId: String): Long

    fun findByPropertyIdOrderByCreatedAtAscIdAsc(
        propertyId: String,
        pageable: Pageable,
    ): List<StaffAccount>

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from StaffAccount s where s.propertyId=:property and s.id=:id")
    fun locked(property: String, id: String): StaffAccount?
}

interface InvitationRepository : JpaRepository<StaffInvitation, String> {
    @Query(
        "select distinct i.propertyId from StaffInvitation i where i.email=:email and i.state=com.villarosa.security.InvitationState.PENDING"
    )
    fun businessIds(email: String): List<String>

    fun findByPropertyIdAndStateAndExpiresAtAfter(
        propertyId: String,
        state: InvitationState,
        expiresAt: Instant,
        pageable: Pageable,
    ): List<StaffInvitation>

    fun existsByPropertyIdAndStateAndExpiresAtAfter(
        propertyId: String,
        state: InvitationState,
        expiresAt: Instant,
    ): Boolean

    fun findByPropertyIdAndId(propertyId: String, id: String): StaffInvitation?

    fun findByPropertyIdAndEmailAndStateOrderByCreatedAtDesc(
        propertyId: String,
        email: String,
        state: InvitationState,
    ): List<StaffInvitation>

    fun findByPropertyIdAndStateOrderByCreatedAtDescIdDesc(
        propertyId: String,
        state: InvitationState,
        pageable: Pageable,
    ): List<StaffInvitation>
}

interface StaffEventRepository : JpaRepository<StaffEvent, Long>
