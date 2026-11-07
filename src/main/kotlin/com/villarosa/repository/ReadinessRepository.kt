package com.villarosa.repository

import com.villarosa.repository.model.*
import jakarta.persistence.LockModeType
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Query

interface ReadinessRepository : JpaRepository<RoomReadiness, Int> {
    fun findByPropertyIdAndRoomId(propertyId: String, roomId: Int): RoomReadiness?

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from RoomReadiness r where r.propertyId=:property and r.roomId=:room")
    fun locked(property: String, room: Int): RoomReadiness?
}

interface ReadinessEventRepository : JpaRepository<ReadinessEvent, Long> {
    @Query(
        "select e from ReadinessEvent e where e.propertyId=:property and e.roomId=:room and e.id>:after order by e.id"
    )
    fun history(property: String, room: Int, after: Long, page: Pageable): List<ReadinessEvent>
}
