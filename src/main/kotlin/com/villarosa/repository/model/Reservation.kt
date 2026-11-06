package com.villarosa.repository.model

import com.fasterxml.jackson.annotation.JsonIgnore
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import jakarta.persistence.Version
import java.time.Instant
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.type.SqlTypes

@Entity
@Table(name = "reservations")
data class Reservation(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) val id: Int? = null,
    @Column(name = "customer_id", nullable = false) val customerId: Int? = null,
    @Column(name = "room_id", nullable = false) var roomId: Int? = null,
    @Column(name = "start_date", nullable = false) var startDate: LocalDate? = null,
    @Column(name = "end_date", nullable = false) var endDate: LocalDate? = null,
    @Column(name = "guest_count", nullable = false) var guestCount: Int = 1,
    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(nullable = false)
    var status: ReservationStatus = ReservationStatus.ACTIVE,
    @Version @Column(nullable = false) var version: Long = 0,
    @JsonIgnore
    @Column(name = "property_id", nullable = false)
    val propertyId: String = "villa-rosa",
    @Column(name = "created_at", nullable = false) val createdAt: Instant = Instant.now(),
    @Column(name = "accepted_quote_id", length = 36) var acceptedQuoteId: String? = null,
) {

    fun toReservationInfo() =
        ReservationInfo(
            id,
            customerId,
            roomId,
            startDate.toString(),
            endDate.toString(),
            guestCount,
            status,
            version,
            ChronoUnit.DAYS.between(startDate, endDate),
            acceptedQuoteId,
        )

    companion object {
        fun buildReservation(
            customerId: Int,
            roomId: Int,
            startDate: LocalDate,
            endDate: LocalDate,
        ) = Reservation(null, customerId, roomId, startDate, endDate)
    }
}

enum class ReservationStatus {
    ACTIVE,
    CANCELLED,
}

data class ReservationInfo(
    val id: Int? = null,
    val customerId: Int? = null,
    val roomId: Int? = null,
    val startDate: String? = null,
    val endDate: String? = null,
    val guestCount: Int = 1,
    val status: ReservationStatus = ReservationStatus.ACTIVE,
    val version: Long = 0,
    val nights: Long = 0,
    val acceptedQuoteId: String? = null,
)
