package com.villarosa.repository

import com.villarosa.repository.model.LedgerEntry
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query

interface LedgerRepository : JpaRepository<LedgerEntry, Long> {
    fun findByPropertyIdAndReservationIdAndId(
        propertyId: String,
        reservationId: Int,
        id: Long,
    ): LedgerEntry?

    fun existsByPropertyIdAndReversesId(propertyId: String, reversesId: Long): Boolean

    @Query(
        "select e from LedgerEntry e where e.propertyId=:property and e.reservationId=:reservation and (:before=0 or e.id<:before) order by e.id desc"
    )
    fun history(
        property: String,
        reservation: Int,
        before: Long,
        pageable: Pageable,
    ): List<LedgerEntry>

    @Query(
        "select e from LedgerEntry e where e.propertyId=:property and e.reservationId=:reservation and e.kind=com.villarosa.repository.model.LedgerKind.PAYMENT and (:before=0 or e.id<:before) and not exists (select r.id from LedgerEntry r where r.propertyId=e.propertyId and r.reversesId=e.id) order by e.id desc"
    )
    fun payments(
        property: String,
        reservation: Int,
        before: Long,
        pageable: Pageable,
    ): List<LedgerEntry>
}
