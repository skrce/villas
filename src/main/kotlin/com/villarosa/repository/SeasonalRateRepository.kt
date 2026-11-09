package com.villarosa.repository

import com.fasterxml.jackson.annotation.JsonIgnore
import jakarta.persistence.*
import java.time.LocalDate
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query

@Entity
@Table(name = "seasonal_rates")
class SeasonalRate(
    @Id @Column(length = 36) val id: String = UUID.randomUUID().toString(),
    @JsonIgnore @Column(name = "property_id", nullable = false, length = 64) val propertyId: String,
    @Column(name = "room_id", nullable = false) val roomId: Int = 0,
    @Column(nullable = false, length = 100) val name: String = "",
    @Column(name = "start_date", nullable = false) val startDate: LocalDate = LocalDate.MIN,
    @Column(name = "end_date", nullable = false) val endDate: LocalDate = LocalDate.MIN,
    @Column(name = "nightly_cents", nullable = false) val nightlyCents: Long = 0,
)

interface SeasonalRateRepository : JpaRepository<SeasonalRate, String> {
    fun findByPropertyIdAndRoomIdOrderByStartDate(
        propertyId: String,
        roomId: Int,
    ): List<SeasonalRate>

    @Modifying
    @Query("delete from SeasonalRate s where s.propertyId=:propertyId and s.roomId=:roomId")
    fun deleteForRoom(propertyId: String, roomId: Int)
}
