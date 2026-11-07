package com.villarosa

import com.villarosa.exception.DomainException
import com.villarosa.repository.*
import com.villarosa.repository.model.*
import com.villarosa.security.StaffAuthentication
import com.villarosa.service.ApartmentService
import com.villarosa.service.CustomerService
import com.villarosa.service.ReadinessService
import java.time.Instant
import java.util.TimeZone
import java.util.UUID
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@ActiveProfiles("test")
@Testcontainers
class RoomReadinessIT
@Autowired
constructor(
    private val service: ReadinessService,
    private val rooms: ApartmentRepository,
    private val guests: CustomerRepository,
    private val reservations: ReservationRepository,
    private val jdbc: JdbcTemplate,
    private val customerService: CustomerService,
    private val apartmentService: ApartmentService,
) {
    private lateinit var room: Apartment

    private fun key() = UUID.randomUUID().toString()

    @BeforeEach
    fun fixtures() {
        TestData.reset(jdbc, database.jdbcUrl)
        room =
            rooms.saveAndFlush(
                Apartment(capacity = 4, name = "Synthetic readiness", reference = "READY")
            )
    }

    private fun change(state: ReadinessState, expected: Long, reason: String? = null) =
        service.change(room.id!!, state, expected, key(), reason)

    private fun clean() {
        change(ReadinessState.IN_PROGRESS, 0)
        change(ReadinessState.INSPECTION, 1)
        change(ReadinessState.CLEAN, 2)
    }

    @Test
    fun newRoomsStartUninspectedAndMustCompleteCleaningAndInspection() {
        val initial = service.read(room.id!!)
        assertThat(initial.state).isEqualTo(ReadinessState.DIRTY)
        assertThat(initial.version).isZero()
        assertThat(assertThrows<DomainException> { change(ReadinessState.CLEAN, 0) }.code)
            .isEqualTo("INVALID_READINESS_TRANSITION")
        clean()
        assertThat(service.read(room.id!!).version).isEqualTo(3)
        val history = service.history(room.id!!, "0", 2)
        assertThat(history.items.map { it.state })
            .containsExactly(ReadinessState.IN_PROGRESS, ReadinessState.INSPECTION)
        assertThat(history.nextCursor).isEqualTo(history.items.last().id)
        assertThat(service.history(room.id!!, history.nextCursor!!, 2).items.single().state)
            .isEqualTo(ReadinessState.CLEAN)
    }

    @Test
    fun sameStateIsANoopButStaleVersionsAndBlankResetReasonsAreRejected() {
        assertThat(change(ReadinessState.DIRTY, 0).readinessEvent).isNull()
        assertThat(service.read(room.id!!).version).isZero()
        assertThat(service.history(room.id!!, "0", 50).items).isEmpty()
        clean()
        assertThat(
                assertThrows<DomainException> {
                        change(ReadinessState.DIRTY, 2, "Synthetic correction")
                    }
                    .code
            )
            .isEqualTo("STALE_VERSION")
        assertThat(assertThrows<DomainException> { change(ReadinessState.DIRTY, 3) }.code)
            .isEqualTo("REASON_REQUIRED")
        change(ReadinessState.DIRTY, 3, "Synthetic inspection failed")
        assertThat(service.history(room.id!!, "0", 50).items.last().reason)
            .isEqualTo("Synthetic inspection failed")
    }

    @Test
    fun occupiedRoomsCannotBeMarkedReadyEvenWhenTheScheduledStayHasEnded() {
        val guest =
            guests.saveAndFlush(
                com.villarosa.repository.model.Customer.buildCustomer(
                    "Synthetic",
                    "Readiness",
                    "000",
                    "Synthetic",
                )
            )
        val booking =
            reservations.saveAndFlush(
                Reservation(
                    customerId = guest.id,
                    roomId = room.id,
                    startDate = java.time.LocalDate.parse("2020-01-01"),
                    endDate = java.time.LocalDate.parse("2020-01-02"),
                    phase = StayPhase.CHECKED_IN,
                    checkedInAt = java.time.Instant.parse("2020-01-01T10:00:00Z"),
                )
            )
        assertThat(assertThrows<DomainException> { change(ReadinessState.IN_PROGRESS, 0) }.code)
            .isEqualTo("ROOM_OCCUPIED")
        assertThat(reservations.findById(booking.id!!).orElseThrow().phase)
            .isEqualTo(StayPhase.CHECKED_IN)
        assertThat(service.read(room.id!!).state).isEqualTo(ReadinessState.DIRTY)
        assertThat(
                assertThrows<DomainException> { customerService.status(guest.id!!, 0, false) }.code
            )
            .isEqualTo("GUEST_HAS_BOOKINGS")
        assertThat(
                assertThrows<DomainException> { apartmentService.status(room.id!!, 0, false) }.code
            )
            .isEqualTo("ROOM_HAS_BOOKINGS")
    }

    @Test
    fun initialNoopReadinessStoresAndReplaysUtcWithANonUtcJvm() {
        val original = TimeZone.getDefault()
        try {
            TimeZone.setDefault(TimeZone.getTimeZone("America/New_York"))
            val before = Instant.now().minusSeconds(1)
            val stable = key()
            val result = service.change(room.id!!, ReadinessState.DIRTY, 0, stable, null)
            val after = Instant.now().plusSeconds(1)
            assertThat(result.readiness!!.changedAt).isBetween(before, after)
            assertThat(service.read(room.id!!).changedAt).isEqualTo(result.readiness.changedAt)
            assertThat(service.change(room.id!!, ReadinessState.DIRTY, 0, stable, null))
                .isEqualTo(result)
        } finally {
            TimeZone.setDefault(original)
        }
    }

    @Test
    fun historicalReplayKeepsTheOriginalResultAndNeverRepeatsEvents() {
        val stable = key()
        val first =
            service.change(room.id!!, ReadinessState.IN_PROGRESS, 0, stable, "Synthetic cleaning")
        assertThat(first.readinessEvent!!.reason).isEqualTo("Synthetic cleaning")
        assertThat(first.readinessEvent.actorId).isEqualTo(TestData.ownerIdentity().id)
        assertThat(first.readinessEvent.operationKey).isEqualTo(stable)
        assertThat(first.readinessEvent.version).isEqualTo(1)
        change(ReadinessState.INSPECTION, 1)
        val replay =
            service.change(room.id!!, ReadinessState.IN_PROGRESS, 0, stable, "Synthetic cleaning")
        assertThat(replay).isEqualTo(first)
        assertThat(service.read(room.id!!).state).isEqualTo(ReadinessState.INSPECTION)
        assertThat(service.history(room.id!!, "0", 50).items).hasSize(2)
        assertThat(
                assertThrows<DomainException> {
                        service.change(room.id!!, ReadinessState.CLEAN, 0, stable, null)
                    }
                    .code
            )
            .isEqualTo("IDEMPOTENCY_KEY_REUSED")
    }

    @Test
    fun twoOwnersCannotBothChangeTheSameReviewedReadinessVersion() {
        TestData.seedOwner(jdbc, index = 1)
        val pool = Executors.newFixedThreadPool(2)
        val gate = CyclicBarrier(2)
        try {
            val calls =
                (0..1).map { owner ->
                    pool.submit<String> {
                        SecurityContextHolder.getContext().authentication =
                            StaffAuthentication(TestData.ownerIdentity(owner))
                        try {
                            gate.await(10, TimeUnit.SECONDS)
                            change(ReadinessState.IN_PROGRESS, 0)
                            "SAVED"
                        } catch (error: DomainException) {
                            error.code
                        } finally {
                            SecurityContextHolder.clearContext()
                        }
                    }
                }
            assertThat(calls.map { it.get(15, TimeUnit.SECONDS) })
                .containsExactlyInAnyOrder("SAVED", "STALE_VERSION")
            assertThat(service.history(room.id!!, "0", 50).items).hasSize(1)
        } finally {
            pool.shutdownNow()
        }
    }

    @Test
    fun readinessAndOperationAndAuditRollBackTogether() {
        jdbc.execute(
            "CREATE TRIGGER synthetic_readiness_failure BEFORE INSERT ON business_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic readiness failure'"
        )
        val stable = key()
        try {
            assertThrows<RuntimeException> {
                service.change(room.id!!, ReadinessState.IN_PROGRESS, 0, stable, null)
            }
        } finally {
            jdbc.execute("DROP TRIGGER synthetic_readiness_failure")
        }
        assertThat(service.read(room.id!!).version).isZero()
        assertThat(service.history(room.id!!, "0", 50).items).isEmpty()
        assertThat(
                jdbc.queryForObject(
                    "SELECT COUNT(*) FROM inventory_operations WHERE operation_key=?",
                    Long::class.java,
                    stable,
                )
            )
            .isZero()
        service.change(room.id!!, ReadinessState.IN_PROGRESS, 0, stable, null)
    }

    @Test
    fun foreignRoomsAndInvalidHistoryRequestsFailWithoutLeakingReadiness() {
        val foreign = rooms.saveAndFlush(room.copy(id = null, propertyId = "other"))
        assertThat(assertThrows<DomainException> { service.read(foreign.id!!) }.code)
            .isEqualTo("NOT_FOUND")
        assertThat(
                assertThrows<DomainException> {
                        service.change(foreign.id!!, ReadinessState.IN_PROGRESS, 0, key(), null)
                    }
                    .code
            )
            .isEqualTo("NOT_FOUND")
        assertThrows<DomainException> { service.history(room.id!!, "-1", 10) }
        assertThrows<DomainException> { service.history(room.id!!, "0", 101) }
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
            registry.add("spring.session.jdbc.initialize-schema") { "never" }
            registry.add("spring.datasource.url", database::getJdbcUrl)
            registry.add("spring.datasource.username", database::getUsername)
            registry.add("spring.datasource.password", database::getPassword)
            registry.add("spring.datasource.driver-class-name", database::getDriverClassName)
            registry.add("spring.jpa.hibernate.ddl-auto") { "validate" }
        }
    }
}
