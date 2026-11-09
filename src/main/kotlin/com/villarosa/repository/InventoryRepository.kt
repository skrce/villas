package com.villarosa.repository

import com.villarosa.repository.model.*
import com.villarosa.security.BusinessScope
import com.villarosa.service.StayDates
import jakarta.persistence.LockModeType
import java.time.LocalDate
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Query
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository

interface MaintenanceRepository : JpaRepository<MaintenanceBlock, Int> {
    @Query("select b.roomId from MaintenanceBlock b where b.propertyId=:property and b.id=:id")
    fun roomId(property: String, id: Int): Int?

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select b from MaintenanceBlock b where b.propertyId=:property and b.id=:id")
    fun locked(property: String, id: Int): MaintenanceBlock?

    @Query(
        "select b from MaintenanceBlock b where b.propertyId=:property and b.startDate<:end and b.endDate>:start and (:status is null or b.status=:status) and (:room is null or b.roomId=:room) and b.id>:after order by b.id"
    )
    fun calendar(
        property: String,
        start: LocalDate,
        end: LocalDate,
        status: ReservationStatus?,
        after: Int,
        pageable: Pageable,
        room: Int? = null,
    ): List<MaintenanceBlock>

    fun findByPropertyIdAndId(propertyId: String, id: Int): MaintenanceBlock?
}

interface InventoryEventRepository : JpaRepository<InventoryEvent, Long> {
    @Query(
        "select e from InventoryEvent e where e.propertyId=:property and e.reservationId=:id and e.id>:after order by e.id"
    )
    fun reservationHistory(
        property: String,
        id: Int,
        after: Long,
        pageable: Pageable,
    ): List<InventoryEvent>

    @Query(
        "select e from InventoryEvent e where e.propertyId=:property and e.maintenanceBlockId=:id and e.id>:after order by e.id"
    )
    fun blockHistory(
        property: String,
        id: Int,
        after: Long,
        pageable: Pageable,
    ): List<InventoryEvent>
}

@Repository
class InventoryAvailability(private val jdbc: JdbcTemplate) {
    fun available(roomId: Int, dates: StayDates, excludedReservation: Int = -1): Boolean =
        jdbc.queryForObject(
            """SELECT (SELECT COUNT(*) FROM reservations r JOIN (${com.villarosa.service.RoomAllocations.SQL}) a ON a.property_id=r.property_id AND a.reservation_id=r.id WHERE r.property_id=? AND a.room_id=? AND r.status='ACTIVE' AND a.start_date<? AND a.end_date>? AND r.id<>?)
              + (SELECT COUNT(*) FROM maintenance_blocks WHERE property_id=? AND room_id=? AND status='ACTIVE' AND start_date<? AND end_date>?)""",
            Long::class.java,
            BusinessScope.id(),
            roomId,
            dates.end,
            dates.start,
            excludedReservation,
            BusinessScope.id(),
            roomId,
            dates.end,
            dates.start,
        ) == 0L
}
