package com.villarosa

import com.villarosa.exception.DomainException
import com.villarosa.repository.ApartmentRepository
import com.villarosa.repository.model.Apartment
import com.villarosa.security.StaffAuthentication
import com.villarosa.service.RateService
import com.villarosa.service.SeasonRate
import java.util.concurrent.CountDownLatch
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
class RoomRatesIT
@Autowired
constructor(
    private val rates: RateService,
    private val rooms: ApartmentRepository,
    private val jdbc: JdbcTemplate,
) {
    @BeforeEach
    fun fixtures() {
        TestData.reset(jdbc, database.jdbcUrl)
        TestData.seedOwner(jdbc, index = 1)
    }

    private fun room() =
        rooms.saveAndFlush(Apartment(capacity = 4, regularPrice = 123, topSeasonPrice = 234))

    private fun season() = SeasonRate("Лето", "2030-07-01", "2030-09-01", 7501)

    private fun failure(action: () -> Unit) = assertThrows<DomainException> { action() }.code

    @Test
    fun oldExamplePricesNeverBecomeConfiguredRatesAndAllNewAmountsAreExact() {
        val room = room()
        val unset = rates.get(room.id!!)
        assertThat(unset.baseNightlyCents).isNull()
        assertThat(unset.version).isZero()
        assertThat(failure { rates.preview(room.id!!, "2030-01-01", "2030-01-03", 1) })
            .isEqualTo("RATES_REQUIRED")
        val saved = rates.update(room.id!!, 0, "EUR", 5003, listOf(season()))
        assertThat(saved.version).isEqualTo(1)
        assertThat(saved.currency).isEqualTo("EUR")
        assertThat(rates.preview(room.id!!, "2030-06-30", "2030-07-03", 4).totalCents)
            .isEqualTo(20005)
        assertThat(rates.preview(room.id!!, "2030-06-30", "2030-07-03", 1).totalCents)
            .isEqualTo(20005)
        assertThat(rooms.findById(room.id!!).get().regularPrice).isEqualTo(123)
        assertThat(rooms.findById(room.id!!).get().topSeasonPrice).isEqualTo(234)
        assertThat(rates.get(room.id!!)).isEqualTo(saved)
    }

    @Test
    fun staleWritesCannotReplaceRatesAndNewSeasonRulesReplaceOldRulesAtomically() {
        val id = room().id!!
        rates.update(id, 0, "EUR", 5000, listOf(season()))
        assertThat(failure { rates.update(id, 0, "EUR", 9999, emptyList()) })
            .isEqualTo("STALE_VERSION")
        assertThat(failure { rates.update(id, -1, "EUR", 9999, emptyList()) })
            .isEqualTo("INVALID_VERSION")
        assertThat(failure { rates.update(id, 1, "EUR", 9999, listOf(season(), season())) })
            .isEqualTo("SEASON_OVERLAP")
        assertThat(rates.get(id).baseNightlyCents).isEqualTo(5000)
        val next = rates.update(id, 1, "EUR", 6001, emptyList())
        assertThat(next.version).isEqualTo(2)
        assertThat(next.seasons).isEmpty()
        assertThat(rates.preview(id, "2030-07-01", "2030-07-03", 2).totalCents).isEqualTo(12002)
    }

    @Test
    fun propertyMembershipRoomStatusAndCapacityAreRechecked() {
        val id = room().id!!
        rates.update(id, 0, "EUR", 5000, emptyList())
        assertThat(failure { rates.get(Int.MAX_VALUE) }).isEqualTo("NOT_FOUND")
        assertThat(failure { rates.update(Int.MAX_VALUE, 0, "EUR", 5000, emptyList()) })
            .isEqualTo("NOT_FOUND")
        assertThat(failure { rates.preview(id, "2030-01-01", "2030-01-03", 0) })
            .isEqualTo("INVALID_GUEST_COUNT")
        assertThat(failure { rates.preview(id, "2030-01-01", "2030-01-03", 5) })
            .isEqualTo("CAPACITY_EXCEEDED")
        jdbc.update("UPDATE apartments SET active=FALSE WHERE id=?", id)
        assertThat(failure { rates.preview(id, "2030-01-01", "2030-01-03", 1) })
            .isEqualTo("ROOM_INACTIVE")
        jdbc.update("UPDATE apartments SET property_id='other-property' WHERE id=?", id)
        assertThat(failure { rates.get(id) }).isEqualTo("NOT_FOUND")
        jdbc.update(
            "UPDATE staff_accounts SET active=FALSE WHERE id=?",
            TestData.ownerIdentity().id,
        )
        assertThat(failure { rates.get(id) }).isEqualTo("SESSION_REVOKED")
    }

    @Test
    fun invalidCurrencyAmountsAndDatabaseConstraintsCannotPublishUnsafeMoney() {
        val id = room().id!!
        assertThat(failure { rates.update(id, 0, "USD", 5000, emptyList()) })
            .isEqualTo("UNSUPPORTED_CURRENCY")
        assertThat(failure { rates.update(id, 0, "EUR", 0, emptyList()) })
            .isEqualTo("INVALID_AMOUNT")
        for (sql in
            listOf(
                "UPDATE apartments SET base_rate_cents=0 WHERE id=$id",
                "UPDATE apartments SET base_rate_cents=9007199254740992 WHERE id=$id",
                "UPDATE apartments SET rate_currency='USD' WHERE id=$id",
                "UPDATE apartments SET rate_currency='eur' WHERE id=$id",
                "UPDATE apartments SET rate_version=-1 WHERE id=$id",
            )) assertThrows<org.springframework.dao.DataAccessException> { jdbc.update(sql) }
        assertThat(rates.get(id).baseNightlyCents).isNull()
    }

    @Test
    fun auditFailureRollsBackBothSeasonReplacementAndTheRateVersion() {
        val id = room().id!!
        val before = rates.update(id, 0, "EUR", 5001, listOf(season()))
        jdbc.execute(
            "CREATE OR REPLACE FUNCTION reject_rate_audit_fn() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RAISE EXCEPTION 'Synthetic audit failure' USING ERRCODE='45000'; END \$\$; CREATE TRIGGER reject_rate_audit BEFORE INSERT ON business_events FOR EACH ROW EXECUTE FUNCTION reject_rate_audit_fn()"
        )
        try {
            assertThrows<org.springframework.dao.DataAccessException> {
                rates.update(id, 1, "EUR", 6001, emptyList())
            }
        } finally {
            jdbc.execute("DROP TRIGGER IF EXISTS reject_rate_audit ON business_events")
        }
        assertThat(rates.get(id)).isEqualTo(before)
        assertThat(
                jdbc.queryForObject(
                    "SELECT COUNT(*) FROM business_events WHERE subject_type='ROOM' AND subject_id=? AND kind='ROOM_RATES_UPDATED'",
                    Long::class.java,
                    id.toString(),
                )
            )
            .isEqualTo(1)
    }

    @Test
    fun twoOwnersCannotOverwriteTheSameReviewedRateVersion() {
        val id = room().id!!
        val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val futures =
                (0..1).map { index ->
                    executor.submit<String> {
                        SecurityContextHolder.getContext().authentication =
                            StaffAuthentication(TestData.ownerIdentity(index))
                        try {
                            check(start.await(10, TimeUnit.SECONDS))
                            rates.update(id, 0, "EUR", 5000L + index, listOf(season()))
                            "SAVED"
                        } catch (failure: DomainException) {
                            failure.code
                        } finally {
                            SecurityContextHolder.clearContext()
                        }
                    }
                }
            start.countDown()
            assertThat(futures.map { it.get(15, TimeUnit.SECONDS) })
                .containsExactlyInAnyOrder("SAVED", "STALE_VERSION")
            assertThat(rates.get(id).version).isEqualTo(1)
            assertThat(rates.get(id).seasons).hasSize(1)
        } finally {
            start.countDown()
            executor.shutdownNow()
            check(executor.awaitTermination(10, TimeUnit.SECONDS))
        }
    }

    companion object {
        @Container @JvmField val database = TestDatabases.postgres()

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
