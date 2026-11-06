package com.villarosa.repository

import com.villarosa.repository.model.*
import com.villarosa.service.PropertyScope
import com.villarosa.service.StayDates
import jakarta.persistence.LockModeType
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
}

interface InventoryEventRepository : JpaRepository<InventoryEvent, Long>

@Repository
class InventoryAvailability(private val jdbc: JdbcTemplate) {
    fun available(roomId: Int, dates: StayDates, excludedReservation: Int = -1): Boolean =
        jdbc.queryForObject(
            """SELECT (SELECT COUNT(*) FROM reservations WHERE property_id=? AND room_id=? AND status='ACTIVE' AND start_date<? AND end_date>? AND id<>?)
              + (SELECT COUNT(*) FROM maintenance_blocks WHERE property_id=? AND room_id=? AND status='ACTIVE' AND start_date<? AND end_date>?)""",
            Long::class.java,
            PropertyScope.ID,
            roomId,
            dates.end,
            dates.start,
            excludedReservation,
            PropertyScope.ID,
            roomId,
            dates.end,
            dates.start,
        ) == 0L
}
