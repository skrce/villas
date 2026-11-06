package com.villarosa.repository

import com.villarosa.repository.model.Reservation
import com.villarosa.repository.model.ReservationStatus
import jakarta.persistence.LockModeType
import java.time.LocalDate
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Query
import org.springframework.stereotype.Repository

@Repository
interface ReservationRepository : JpaRepository<Reservation, Int> {
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
    ): List<Reservation>

    fun findByRoomId(roomId: Int): List<Reservation>

    fun findByStartDateBeforeAndEndDateAfter(
        endDate: LocalDate,
        startDate: LocalDate,
    ): List<Reservation>

    fun findByCustomerId(customerId: Int): List<Reservation>
}
