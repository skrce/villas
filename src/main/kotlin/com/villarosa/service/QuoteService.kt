package com.villarosa.service

import com.villarosa.exception.DomainException
import com.villarosa.exception.conflict
import com.villarosa.exception.invalid
import com.villarosa.exception.missing
import com.villarosa.repository.*
import com.villarosa.repository.model.Apartment
import com.villarosa.repository.model.Reservation
import com.villarosa.security.BusinessAudit
import com.villarosa.security.CurrentStaff
import com.villarosa.security.StaffAccess
import jakarta.persistence.EntityManager
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID
import org.springframework.data.domain.PageRequest
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.ObjectMapper

data class BookingQuote(
    val id: String,
    val roomId: Int,
    val startDate: String,
    val endDate: String,
    val guestCount: Int,
    val createdAt: Instant,
    val expiresAt: Instant,
    val price: StayPrice,
)

data class AcceptedPrice(
    val reservationId: Int,
    val reservationVersion: Long,
    val acceptedAt: Instant,
    val quote: BookingQuote,
)

data class PriceHistory(val items: List<AcceptedPrice>, val nextCursor: Long?)

class QuoteReviewRequired(val quoteId: String) : RuntimeException()

@Service
@Transactional(isolation = Isolation.READ_COMMITTED)
class QuoteService(
    private val rates: RateService,
    private val quotes: QuoteRepository,
    private val prices: ReservationPriceRepository,
    private val reservations: ReservationRepository,
    private val current: CurrentStaff,
    private val access: StaffAccess,
    private val audit: BusinessAudit,
    private val clock: Clock,
    private val json: ObjectMapper,
    private val entities: EntityManager,
) {
    fun id(value: String): String {
        if (
            !Regex("[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}")
                .matches(value)
        )
            invalid("INVALID_QUOTE", "Quote ID must be a UUID.")
        return UUID.fromString(value).toString()
    }

    fun create(
        roomId: Int,
        start: String,
        end: String,
        guestCount: Int,
        currency: String = "EUR",
    ): BookingQuote {
        val actor = access.lockOwner(current.identity())
        EuroCents.currency(currency)
        val dates = StayDates.parse(start, end)
        val price = rates.preview(roomId, start, end, guestCount)
        val created = clock.instant().truncatedTo(ChronoUnit.MICROS)
        val saved =
            StoredQuote(
                actorId = actor.id,
                roomId = roomId,
                startDate = dates.start,
                endDate = dates.end,
                guestCount = guestCount,
                rateVersion = price.rateVersion,
                totalCents = price.totalCents,
                priceJson = json.writeValueAsString(price),
                createdAt = created,
                expiresAt = created.plus(LIFETIME),
            )
        entities.persist(saved)
        entities.flush()
        audit.record(actor.id, "QUOTE_CREATED", "QUOTE", saved.id)
        return view(saved)
    }

    @Transactional(readOnly = true)
    fun get(quoteId: String): BookingQuote {
        access.current(current.identity())
        return view(owned(quoteId))
    }

    @Transactional(propagation = Propagation.MANDATORY)
    fun owned(quoteId: String): StoredQuote =
        quotes.findByPropertyIdAndIdAndActorId(PropertyScope.ID, id(quoteId), current.identity().id)
            ?: missing("Quote does not exist.")

    @Transactional(propagation = Propagation.MANDATORY)
    fun acceptable(
        quoteId: String,
        room: Apartment,
        dates: StayDates,
        guestCount: Int,
    ): BookingQuote {
        val quote = owned(quoteId)
        if (
            quote.roomId != room.id ||
                quote.startDate != dates.start ||
                quote.endDate != dates.end ||
                quote.guestCount != guestCount
        )
            conflict("QUOTE_MISMATCH", "The quote does not match these stay details.")
        val used = prices.findByPropertyIdAndId(PropertyScope.ID, quote.id)
        if (used != null)
            throw DomainException(
                "QUOTE_ALREADY_ACCEPTED",
                HttpStatus.CONFLICT,
                "This quote was already accepted. Review the saved reservation.",
                listOf(used.reservationId),
            )
        if (!clock.instant().isBefore(quote.expiresAt) || quote.rateVersion != room.rateVersion)
            throw QuoteReviewRequired(quote.id)
        return view(quote)
    }

    @Transactional(propagation = Propagation.MANDATORY)
    fun accept(quote: BookingQuote, reservation: Reservation) {
        val actor = current.identity().id
        entities.persist(
            StoredReservationPrice(
                id = quote.id,
                reservationId = reservation.id!!,
                reservationVersion = reservation.version,
                actorId = actor,
                quoteJson = json.writeValueAsString(quote),
                acceptedAt = clock.instant().truncatedTo(ChronoUnit.MICROS),
            )
        )
        entities.flush()
        audit.record(actor, "PRICE_ACCEPTED", "RESERVATION", reservation.id!!.toString())
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    fun refresh(quoteId: String): DomainException {
        access.lockOwner(current.identity())
        val old = owned(quoteId)
        val replacement =
            create(old.roomId, old.startDate.toString(), old.endDate.toString(), old.guestCount)
        return DomainException(
            "QUOTE_CHANGED",
            HttpStatus.CONFLICT,
            "The quote expired or room rates changed. Review and accept the refreshed quote.",
            replacementQuote = replacement,
        )
    }

    @Transactional(readOnly = true)
    fun currentPrice(reservationId: Int): AcceptedPrice? {
        access.current(current.identity())
        val reservation =
            reservations.findByPropertyIdAndId(PropertyScope.ID, reservationId)
                ?: missing("Reservation does not exist.")
        val quoteId = reservation.acceptedQuoteId ?: return null
        val saved =
            prices.findByPropertyIdAndId(PropertyScope.ID, quoteId)
                ?: error("Accepted reservation price is unavailable.")
        check(saved.reservationId == reservationId)
        return accepted(saved)
    }

    @Transactional(readOnly = true)
    fun history(reservationId: Int, beforeVersion: Long?, limit: Int): PriceHistory {
        access.current(current.identity())
        if (reservations.findByPropertyIdAndId(PropertyScope.ID, reservationId) == null)
            missing("Reservation does not exist.")
        if (beforeVersion != null && beforeVersion < 0)
            invalid("INVALID_CURSOR", "Price cursor must not be negative.")
        if (limit !in 1..100) invalid("INVALID_PAGE_SIZE", "Limit must be between 1 and 100.")
        val rows =
            prices.history(
                PropertyScope.ID,
                reservationId,
                beforeVersion,
                PageRequest.of(0, limit + 1),
            )
        return PriceHistory(
            rows.take(limit).map { accepted(it) },
            if (rows.size > limit) rows[limit - 1].reservationVersion else null,
        )
    }

    private fun view(quote: StoredQuote): BookingQuote =
        BookingQuote(
            quote.id,
            quote.roomId,
            quote.startDate.toString(),
            quote.endDate.toString(),
            quote.guestCount,
            quote.createdAt,
            quote.expiresAt,
            json.readValue(quote.priceJson, StayPrice::class.java),
        )

    private fun accepted(price: StoredReservationPrice) =
        AcceptedPrice(
            price.reservationId,
            price.reservationVersion,
            price.acceptedAt,
            json.readValue(price.quoteJson, BookingQuote::class.java),
        )

    companion object {
        val LIFETIME: Duration = Duration.ofMinutes(15)
    }
}
