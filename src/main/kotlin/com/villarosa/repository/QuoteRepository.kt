package com.villarosa.repository

import jakarta.persistence.*
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query

@Entity
@Table(name = "booking_quotes")
class StoredQuote(
    @Id @Column(length = 36) val id: String = UUID.randomUUID().toString(),
    @Column(name = "property_id", nullable = false, length = 64) val propertyId: String,
    @Column(name = "actor_id", nullable = false, length = 36) val actorId: String = "",
    @Column(name = "room_id", nullable = false) val roomId: Int = 0,
    @Column(name = "start_date", nullable = false) val startDate: LocalDate = LocalDate.MIN,
    @Column(name = "end_date", nullable = false) val endDate: LocalDate = LocalDate.MIN,
    @Column(name = "guest_count", nullable = false) val guestCount: Int = 1,
    @Column(nullable = false, length = 3) val currency: String = "EUR",
    @Column(name = "rate_version", nullable = false) val rateVersion: Long = 0,
    @Column(name = "total_cents", nullable = false) val totalCents: Long = 0,
    @Column(name = "price_json", nullable = false, columnDefinition = "TEXT")
    val priceJson: String = "",
    @Column(name = "created_at", nullable = false) val createdAt: Instant = Instant.EPOCH,
    @Column(name = "expires_at", nullable = false) val expiresAt: Instant = Instant.EPOCH,
)

@Entity
@Table(
    name = "reservation_prices",
    uniqueConstraints =
        [UniqueConstraint(columnNames = ["property_id", "reservation_id", "reservation_version"])],
)
class StoredReservationPrice(
    @Id @Column(length = 36) val id: String = "",
    @Column(name = "property_id", nullable = false, length = 64) val propertyId: String,
    @Column(name = "reservation_id", nullable = false) val reservationId: Int = 0,
    @Column(name = "reservation_version", nullable = false) val reservationVersion: Long = 0,
    @Column(name = "actor_id", nullable = false, length = 36) val actorId: String = "",
    @Column(name = "quote_json", nullable = false, columnDefinition = "TEXT")
    val quoteJson: String = "",
    @Column(name = "accepted_at", nullable = false) val acceptedAt: Instant = Instant.EPOCH,
)

interface QuoteRepository : JpaRepository<StoredQuote, String> {
    fun findByPropertyIdAndIdAndActorId(
        propertyId: String,
        id: String,
        actorId: String,
    ): StoredQuote?
}

interface ReservationPriceRepository : JpaRepository<StoredReservationPrice, String> {
    fun findByPropertyIdAndId(propertyId: String, id: String): StoredReservationPrice?

    @Query(
        "select p from StoredReservationPrice p where p.propertyId=:property and p.reservationId=:reservation and (:before is null or p.reservationVersion<:before) order by p.reservationVersion desc"
    )
    fun history(
        property: String,
        reservation: Int,
        before: Long?,
        pageable: Pageable,
    ): List<StoredReservationPrice>
}
