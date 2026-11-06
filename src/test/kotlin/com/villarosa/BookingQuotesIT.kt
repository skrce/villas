package com.villarosa

import com.villarosa.exception.DomainException
import com.villarosa.repository.*
import com.villarosa.repository.model.*
import com.villarosa.security.StaffAuthentication
import com.villarosa.service.*
import java.time.*
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers

class MutablePriceClock : Clock() {
    var value: Instant = Instant.parse("2026-11-06T12:00:00.123456Z")

    override fun instant(): Instant = value

    override fun getZone(): ZoneId = ZoneOffset.UTC

    override fun withZone(zone: ZoneId): Clock = fixed(value, zone)
}

@TestConfiguration
class PriceClockConfiguration {
    @Bean @Primary fun priceClock() = MutablePriceClock()
}

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@ActiveProfiles("test")
@Import(PriceClockConfiguration::class)
@Testcontainers
class BookingQuotesIT
@Autowired
constructor(
    private val quotes: QuoteService,
    private val rates: RateService,
    private val inventory: ReservationService,
    private val operations: OperationCoordinator,
    private val reservations: ReservationRepository,
    private val rooms: ApartmentRepository,
    private val guests: CustomerRepository,
    private val clock: MutablePriceClock,
    private val jdbc: JdbcTemplate,
    private val json: tools.jackson.databind.ObjectMapper,
) {
    private lateinit var room: Apartment
    private var guestId = 0

    @BeforeEach
    fun fixtures() {
        TestData.reset(jdbc, database.jdbcUrl)
        TestData.seedOwner(jdbc, index = 1)
        clock.value = Instant.parse("2026-11-06T12:00:00.123456Z")
        room = rooms.saveAndFlush(Apartment(capacity = 4, baseRateCents = 5001, rateVersion = 1))
        guestId =
            guests.saveAndFlush(Customer(firstName = "Synthetic", lastName = "Quote guest")).id!!
    }

    private fun key() = UUID.randomUUID().toString()

    private fun quote() = quotes.create(room.id!!, "2030-01-01", "2030-01-03", 2)

    private fun confirm(quote: BookingQuote, key: String = key()) =
        inventory.createQuoted(
            guestId,
            quote.id,
            quote.roomId,
            quote.startDate,
            quote.endDate,
            quote.guestCount,
            key,
        )

    private fun count(table: String) =
        jdbc.queryForObject("SELECT COUNT(*) FROM $table", Long::class.java)!!

    private fun failure(action: () -> Unit) = assertThrows<DomainException> { action() }

    @Test
    fun oldCommittedUnpricedCreatesRemainRecoverableButNewUnquotedWritesAreRejected() {
        val key = key()
        val historical =
            operations.execute(
                OperationKind.CREATE,
                key,
                listOf(guestId, room.id!!, "2030-01-01", "2030-01-03", 2),
            ) {
                val booking =
                    reservations.saveAndFlush(
                        Reservation(
                            customerId = guestId,
                            roomId = room.id,
                            startDate = LocalDate.of(2030, 1, 1),
                            endDate = LocalDate.of(2030, 1, 3),
                            guestCount = 2,
                        )
                    )
                OperationResult(
                    it,
                    OperationKind.CREATE,
                    booking.id!!,
                    reservation = booking.toReservationInfo(),
                )
            }
        assertThat(inventory.create(guestId, room.id!!, "2030-01-01", "2030-01-03", 2, key))
            .isEqualTo(historical)
        assertThat(
                failure {
                    inventory.create(guestId, room.id!!, "2030-02-01", "2030-02-03", 2, key())
                }
                    .code
            )
            .isEqualTo("QUOTE_REQUIRED")
        assertThat(count("reservations")).isEqualTo(1)
        assertThat(count("inventory_operations")).isEqualTo(1)
        assertThat(count("reservation_prices")).isZero()
        assertThat(quotes.currentPrice(historical.resourceId)).isNull()
    }

    @ParameterizedTest
    @ValueSource(
        strings =
            [
                "GUEST_ARCHIVED",
                "ROOM_INACTIVE",
                "CAPACITY_EXCEEDED",
                "MISSING_GUEST",
                "MISSING_ROOM",
            ]
    )
    fun quoteConfirmationRechecksCurrentGuestAndRoomState(change: String) {
        val quote = quote()
        when (change) {
            "GUEST_ARCHIVED" -> jdbc.update("UPDATE customers SET active=FALSE WHERE id=?", guestId)
            "ROOM_INACTIVE" -> jdbc.update("UPDATE apartments SET active=FALSE WHERE id=?", room.id)
            "CAPACITY_EXCEEDED" ->
                jdbc.update("UPDATE apartments SET capacity=1 WHERE id=?", room.id)
            else -> Unit
        }
        val failure = failure {
            inventory.createQuoted(
                if (change == "MISSING_GUEST") Int.MAX_VALUE else guestId,
                quote.id,
                if (change == "MISSING_ROOM") Int.MAX_VALUE else room.id!!,
                quote.startDate,
                quote.endDate,
                2,
                key(),
            )
        }
        assertThat(failure.code)
            .isEqualTo(if (change.startsWith("MISSING_")) "NOT_FOUND" else change)
        assertThat(count("reservations")).isZero()
        assertThat(count("reservation_prices")).isZero()
        assertThat(count("inventory_operations")).isZero()
    }

    @Test
    fun aSavedQuoteIsExactStableAndDoesNotReserveInventory() {
        val quote = quote()
        assertThat(quote.price.currency).isEqualTo("EUR")
        assertThat(quote.price.totalCents).isEqualTo(10002)
        assertThat(Duration.between(quote.createdAt, quote.expiresAt))
            .isEqualTo(Duration.ofMinutes(15))
        assertThat(quotes.get(quote.id)).isEqualTo(quote)
        assertThat(count("reservations")).isZero()
        assertThat(count("reservation_prices")).isZero()
        assertThat(
                inventory.findAvailableApartments(quote.startDate, quote.endDate, 2).map { it.id }
            )
            .contains(room.id)
    }

    @Test
    fun acceptedPriceInventoryEventsAndOperationCommitTogetherAndReplayAfterExpiry() {
        val quote = quote()
        val key = key()
        val saved = confirm(quote, key)
        assertThat(saved.reservation!!.version).isZero()
        assertThat(saved.reservation!!.acceptedQuoteId).isEqualTo(quote.id)
        val price = quotes.currentPrice(saved.resourceId)!!
        assertThat(price.quote).isEqualTo(quote)
        assertThat(price.reservationVersion).isZero()
        assertThat(count("reservation_prices")).isEqualTo(1)
        assertThat(count("inventory_operations")).isEqualTo(1)
        assertThat(count("inventory_events")).isEqualTo(1)
        clock.value = quote.expiresAt.plusSeconds(3600)
        assertThat(confirm(quote, key)).isEqualTo(saved)
        assertThat(inventory.operation(OperationKind.CREATE, key)).isEqualTo(saved)
        assertThat(count("reservations")).isEqualTo(1)
        assertThat(quotes.currentPrice(saved.resourceId)).isEqualTo(price)
    }

    @Test
    fun aQuoteCannotBeConsumedAgainWithAnotherKeyEvenAfterCancellation() {
        val quote = quote()
        val saved = confirm(quote)
        inventory.cancel(saved.resourceId, 0, key())
        val rejected = failure { confirm(quote) }
        assertThat(rejected.code).isEqualTo("QUOTE_ALREADY_ACCEPTED")
        assertThat(rejected.relatedReservationIds).containsExactly(saved.resourceId)
        assertThat(count("reservations")).isEqualTo(1)
        assertThat(quotes.currentPrice(saved.resourceId)!!.quote.price.totalCents).isEqualTo(10002)
        assertThat(quotes.history(saved.resourceId, null, 20).items).hasSize(1)
    }

    @ParameterizedTest
    @ValueSource(longs = [0, 1])
    fun expiryRequiresAnExplicitFreshAcceptanceAndLeavesTheOldKeyUncommitted(extraSeconds: Long) {
        val old = quote()
        clock.value = old.expiresAt.plusSeconds(extraSeconds)
        val attempted = key()
        val rejected = failure { confirm(old, attempted) }
        assertThat(rejected.code).isEqualTo("QUOTE_CHANGED")
        val fresh = rejected.replacementQuote!!
        assertThat(fresh.id).isNotEqualTo(old.id)
        assertThat(fresh.price).isEqualTo(old.price)
        assertThat(quotes.get(fresh.id)).isEqualTo(fresh)
        assertThat(count("reservations")).isZero()
        assertThat(count("reservation_prices")).isZero()
        assertThat(failure { inventory.operation(OperationKind.CREATE, attempted) }.code)
            .isEqualTo("OPERATION_NOT_COMMITTED")
        assertThat(confirm(fresh).reservation!!.acceptedQuoteId).isEqualTo(fresh.id)
    }

    @ParameterizedTest
    @ValueSource(longs = [5001, 6001])
    fun anyRateVersionChangeRequiresReviewEvenWhenTheTotalDoesNotChange(newBase: Long) {
        val old = quote()
        rates.update(room.id!!, 1, "EUR", newBase, emptyList())
        val rejected = failure { confirm(old) }
        assertThat(rejected.code).isEqualTo("QUOTE_CHANGED")
        val fresh = rejected.replacementQuote!!
        assertThat(fresh.price.rateVersion).isEqualTo(2)
        assertThat(fresh.price.totalCents).isEqualTo(newBase * 2)
        assertThat(quotes.get(old.id)).isEqualTo(old)
        assertThat(count("reservations")).isZero()
        assertThat(quotes.currentPrice(confirm(fresh).resourceId)!!.quote).isEqualTo(fresh)
    }

    @Test
    fun laterRatesAndCancellationCannotRewriteAnAcceptedPrice() {
        val quote = quote()
        val saved = confirm(quote)
        val before = quotes.currentPrice(saved.resourceId)
        rates.update(room.id!!, 1, "EUR", 9901, emptyList())
        assertThat(quotes.currentPrice(saved.resourceId)).isEqualTo(before)
        inventory.cancel(saved.resourceId, 0, key())
        assertThat(quotes.currentPrice(saved.resourceId)).isEqualTo(before)
        assertThat(quotes.history(saved.resourceId, null, 1).items).containsExactly(before)
        assertThat(quotes.history(saved.resourceId, 0, 1).items).isEmpty()
    }

    @Test
    fun quotedRoomDatesAndPartySizeCannotBeSubstitutedAtConfirmation() {
        val quote = quote()
        val second =
            rooms.saveAndFlush(Apartment(capacity = 4, baseRateCents = 5001, rateVersion = 1))
        assertThat(
                failure {
                    inventory.createQuoted(
                        guestId,
                        quote.id,
                        second.id!!,
                        quote.startDate,
                        quote.endDate,
                        2,
                        key(),
                    )
                }
                    .code
            )
            .isEqualTo("QUOTE_MISMATCH")
        assertThat(
                failure {
                    inventory.createQuoted(
                        guestId,
                        quote.id,
                        room.id!!,
                        "2030-01-02",
                        quote.endDate,
                        2,
                        key(),
                    )
                }
                    .code
            )
            .isEqualTo("QUOTE_MISMATCH")
        assertThat(
                failure {
                    inventory.createQuoted(
                        guestId,
                        quote.id,
                        room.id!!,
                        quote.startDate,
                        quote.endDate,
                        3,
                        key(),
                    )
                }
                    .code
            )
            .isEqualTo("QUOTE_MISMATCH")
        assertThat(count("reservations")).isZero()
    }

    @Test
    fun checkoutCannotBeSubstitutedAtConfirmation() {
        val quote = quote()
        assertThat(
                failure {
                    inventory.createQuoted(
                        guestId,
                        quote.id,
                        room.id!!,
                        quote.startDate,
                        "2030-01-04",
                        2,
                        key(),
                    )
                }
                    .code
            )
            .isEqualTo("QUOTE_MISMATCH")
        assertThat(count("reservations")).isZero()
        assertThat(count("reservation_prices")).isZero()
    }

    @Test
    fun historicalPricePagesUseExclusiveVersionsAndRejectInvalidBounds() {
        val first = quote()
        val saved = confirm(first)
        val second = quote()
        val third = quote()
        for ((version, quote) in listOf(2 to second, 4 to third)) {
            jdbc.update(
                "INSERT INTO reservation_prices (id,property_id,reservation_id,reservation_version,actor_id,quote_json,accepted_at) VALUES (?,'villa-rosa',?,?,?,?,CURRENT_TIMESTAMP(6))",
                quote.id,
                saved.resourceId,
                version,
                TestData.ownerIdentity().id,
                json.writeValueAsString(quote),
            )
        }
        jdbc.update(
            "UPDATE reservations SET version=4,accepted_quote_id=? WHERE id=?",
            third.id,
            saved.resourceId,
        )
        val page = quotes.history(saved.resourceId, null, 2)
        assertThat(page.items.map { it.quote.id }).containsExactly(third.id, second.id)
        assertThat(page.nextCursor).isEqualTo(2)
        assertThat(quotes.history(saved.resourceId, page.nextCursor, 2).items.map { it.quote.id })
            .containsExactly(first.id)
        assertThat(quotes.history(saved.resourceId, 0, 100).items).isEmpty()
        assertThat(quotes.currentPrice(saved.resourceId)!!.quote.id).isEqualTo(third.id)
        assertThat(failure { quotes.history(saved.resourceId, -1, 1) }.code)
            .isEqualTo("INVALID_CURSOR")
        for (limit in listOf(0, 101)) assertThat(
                failure { quotes.history(saved.resourceId, null, limit) }.code
            )
            .isEqualTo("INVALID_PAGE_SIZE")
        assertThat(failure { quotes.history(Int.MAX_VALUE, null, 1) }.code).isEqualTo("NOT_FOUND")
    }

    @Test
    fun missingOrMisdirectedAcceptedPriceRecordsCannotBecomeAFalseUnpricedOrOtherReservationPrice() {
        val first = quote()
        val booking = confirm(first)
        jdbc.update("DELETE FROM reservation_prices WHERE id=?", first.id)
        assertThrows<IllegalStateException> { quotes.currentPrice(booking.resourceId) }
        val second = quotes.create(room.id!!, "2030-02-01", "2030-02-03", 2)
        confirm(second)
        jdbc.update(
            "UPDATE reservations SET accepted_quote_id=? WHERE id=?",
            second.id,
            booking.resourceId,
        )
        assertThrows<IllegalStateException> { quotes.currentPrice(booking.resourceId) }
    }

    @Test
    fun aFailedReplacementQuoteDoesNotReturnAnOfferThatWasRolledBack() {
        val old = quote()
        clock.value = old.expiresAt
        val operation = key()
        jdbc.execute(
            "CREATE TRIGGER reject_refresh BEFORE INSERT ON business_events FOR EACH ROW BEGIN IF NEW.kind='QUOTE_CREATED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic quote audit failure'; END IF; END"
        )
        try {
            assertThrows<org.springframework.dao.DataAccessException> { confirm(old, operation) }
        } finally {
            jdbc.execute("DROP TRIGGER IF EXISTS reject_refresh")
        }
        assertThat(count("booking_quotes")).isEqualTo(1)
        assertThat(quotes.get(old.id)).isEqualTo(old)
        assertThat(count("reservations")).isZero()
        assertThat(count("reservation_prices")).isZero()
        assertThat(failure { inventory.operation(OperationKind.CREATE, operation) }.code)
            .isEqualTo("OPERATION_NOT_COMMITTED")
    }

    @Test
    fun otherOwnersCannotReadOrConfirmAnUnacceptedQuoteButCanReadAcceptedPropertyPrices() {
        val quote = quote()
        SecurityContextHolder.getContext().authentication =
            StaffAuthentication(TestData.ownerIdentity(1))
        assertThat(failure { quotes.get(quote.id) }.code).isEqualTo("NOT_FOUND")
        assertThat(failure { confirm(quote) }.code).isEqualTo("NOT_FOUND")
        SecurityContextHolder.getContext().authentication =
            StaffAuthentication(TestData.ownerIdentity())
        val booking = confirm(quote)
        SecurityContextHolder.getContext().authentication =
            StaffAuthentication(TestData.ownerIdentity(1))
        assertThat(quotes.currentPrice(booking.resourceId)!!.quote.price.totalCents)
            .isEqualTo(10002)
        jdbc.update(
            "UPDATE staff_accounts SET active=FALSE WHERE id=?",
            TestData.ownerIdentity(1).id,
        )
        assertThat(failure { quotes.currentPrice(booking.resourceId) }.code)
            .isEqualTo("SESSION_REVOKED")
    }

    @ParameterizedTest
    @ValueSource(strings = ["PRICE_AUDIT", "INVENTORY_EVENT"])
    fun anyAcceptedPriceEventFailureRollsBackTheCompleteBookingAndRetainsTheKeyForRetry(
        kind: String
    ) {
        val quote = quote()
        val key = key()
        if (kind == "PRICE_AUDIT")
            jdbc.execute(
                "CREATE TRIGGER reject_price BEFORE INSERT ON business_events FOR EACH ROW BEGIN IF NEW.kind='PRICE_ACCEPTED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic price audit failure'; END IF; END"
            )
        else
            jdbc.execute(
                "CREATE TRIGGER reject_price BEFORE INSERT ON inventory_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic inventory event failure'"
            )
        try {
            assertThrows<org.springframework.dao.DataAccessException> { confirm(quote, key) }
        } finally {
            jdbc.execute("DROP TRIGGER IF EXISTS reject_price")
        }
        assertThat(count("reservations")).isZero()
        assertThat(count("reservation_prices")).isZero()
        assertThat(count("inventory_operations")).isZero()
        assertThat(count("inventory_events")).isZero()
        assertThat(confirm(quote, key).reservation!!.acceptedQuoteId).isEqualTo(quote.id)
    }

    @Test
    fun unapprovedUnquotedEditPathsCannotChangeAPricedStay() {
        val saved = confirm(quote())
        val second =
            rooms.saveAndFlush(Apartment(capacity = 4, baseRateCents = 5001, rateVersion = 1))
        assertThat(failure { inventory.move(saved.resourceId, second.id!!, 0, key()) }.code)
            .isEqualTo("PRICE_REVIEW_REQUIRED")
        assertThat(
                failure {
                    inventory.change(saved.resourceId, "2030-01-01", "2030-01-04", 2, 0, key())
                }
                    .code
            )
            .isEqualTo("PRICE_REVIEW_REQUIRED")
        assertThat(inventory.move(saved.resourceId, room.id!!, 0, key()).reservation!!.version)
            .isZero()
        assertThat(inventory.reservation(saved.resourceId).endDate).isEqualTo("2030-01-03")
        assertThat(quotes.currentPrice(saved.resourceId)!!.quote.price.totalCents).isEqualTo(10002)
    }

    @Test
    fun confirmationRacingARateReplacementEitherSavesTheReviewedPriceOrRequiresReview() {
        val start = CountDownLatch(1)
        val quote = quote()
        val executor = Executors.newFixedThreadPool(2)
        try {
            val reserve =
                executor.submit<String> {
                    SecurityContextHolder.getContext().authentication =
                        StaffAuthentication(TestData.ownerIdentity())
                    try {
                        check(start.await(10, TimeUnit.SECONDS))
                        confirm(quote)
                        "BOOKED"
                    } catch (failure: DomainException) {
                        failure.code
                    } finally {
                        SecurityContextHolder.clearContext()
                    }
                }
            val update =
                executor.submit<Unit> {
                    SecurityContextHolder.getContext().authentication =
                        StaffAuthentication(TestData.ownerIdentity(1))
                    try {
                        check(start.await(10, TimeUnit.SECONDS))
                        rates.update(room.id!!, 1, "EUR", 6001, emptyList())
                    } finally {
                        SecurityContextHolder.clearContext()
                    }
                }
            start.countDown()
            val outcome = reserve.get(15, TimeUnit.SECONDS)
            update.get(15, TimeUnit.SECONDS)
            assertThat(outcome).isIn("BOOKED", "QUOTE_CHANGED")
            if (outcome == "BOOKED") {
                assertThat(count("reservation_prices")).isEqualTo(1)
                val reservationId =
                    jdbc.queryForObject("SELECT id FROM reservations", Int::class.java)!!
                assertThat(quotes.currentPrice(reservationId)!!.quote.price.totalCents)
                    .isEqualTo(10002)
            } else {
                assertThat(count("reservations")).isZero()
                assertThat(count("reservation_prices")).isZero()
            }
        } finally {
            start.countDown()
            executor.shutdownNow()
            check(executor.awaitTermination(10, TimeUnit.SECONDS))
        }
    }

    @Test
    fun missingRatesAndInvalidInputsCannotCreateProposedQuotesOrPriceHistory() {
        val empty = rooms.saveAndFlush(Apartment(capacity = 2))
        assertThat(failure { quotes.create(empty.id!!, "2030-01-01", "2030-01-03", 1) }.code)
            .isEqualTo("RATES_REQUIRED")
        assertThat(failure { quotes.create(room.id!!, "2030-01-01", "2030-01-03", 1, "USD") }.code)
            .isEqualTo("UNSUPPORTED_CURRENCY")
        assertThat(failure { quotes.get("not-a-quote") }.code).isEqualTo("INVALID_QUOTE")
        assertThat(failure { quotes.currentPrice(Int.MAX_VALUE) }.code).isEqualTo("NOT_FOUND")
        assertThat(count("booking_quotes")).isZero()
    }

    companion object {
        @Container @JvmField val database = TestDatabases.mariaDb()

        @JvmStatic
        @BeforeAll
        fun migrate() {
            DatabaseMigrations.migrate(database.jdbcUrl, database.username, database.password)
        }

        @JvmStatic
        @DynamicPropertySource
        fun properties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", database::getJdbcUrl)
            registry.add("spring.datasource.username", database::getUsername)
            registry.add("spring.datasource.password", database::getPassword)
            registry.add("spring.datasource.driver-class-name", database::getDriverClassName)
            registry.add("spring.jpa.hibernate.ddl-auto") { "validate" }
            registry.add("spring.session.jdbc.initialize-schema") { "never" }
        }
    }
}
