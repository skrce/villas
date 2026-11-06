package com.villarosa.repository

import com.villarosa.repository.model.Reservation
import com.villarosa.repository.model.ReservationStatus
import jakarta.persistence.LockModeType
import java.time.LocalDate
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Query
import org.springframework.stereotype.Repository

@Repository
interface ReservationRepository : JpaRepository<Reservation, Int> {
    @Query("select r.customerId from Reservation r where r.propertyId=:property and r.id=:id")
    fun customerId(property: String, id: Int): Int?

    @Query(
        "select r from Reservation r where r.propertyId=:property and r.customerId=:guest and (:after=0 or r.id<:after) and (:status is null or r.status=:status) order by r.id desc"
    )
    fun guestHistory(
        property: String,
        guest: Int,
        after: Int,
        status: ReservationStatus?,
        pageable: Pageable,
    ): List<Reservation>

    @Query("select r.roomId from Reservation r where r.propertyId=:property and r.id=:id")
    fun roomId(property: String, id: Int): Int?

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from Reservation r where r.propertyId=:property and r.id=:id")
    fun locked(property: String, id: Int): Reservation?

    fun findByPropertyIdAndId(propertyId: String, id: Int): Reservation?

    fun findByPropertyIdAndCustomerIdAndStatus(
        propertyId: String,
        customerId: Int,
        status: ReservationStatus,
        pageable: Pageable,
    ): List<Reservation>

    @Query(
        "select r from Reservation r where r.propertyId=:property and r.startDate<:end and r.endDate>:start and (:status is null or r.status=:status) and (:room is null or r.roomId=:room) and r.id>:after order by r.id"
    )
    fun calendar(
        property: String,
        start: LocalDate,
        end: LocalDate,
        status: ReservationStatus?,
        after: Int,
        pageable: Pageable,
        room: Int? = null,
    ): List<Reservation>

    fun findByRoomId(roomId: Int): List<Reservation>

    fun findByStartDateBeforeAndEndDateAfter(
        endDate: LocalDate,
        startDate: LocalDate,
    ): List<Reservation>

    fun findByCustomerId(customerId: Int): List<Reservation>
}
