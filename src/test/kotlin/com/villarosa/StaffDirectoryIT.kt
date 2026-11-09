package com.villarosa

import com.villarosa.exception.DomainException
import com.villarosa.security.*
import java.nio.file.Files
import java.nio.file.Path
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers

class StaffTestClock : Clock() {
    val time = AtomicReference(Instant.parse("2026-11-06T00:00:00Z"))

    override fun instant(): Instant = time.get()

    override fun getZone(): ZoneId = ZoneOffset.UTC

    override fun withZone(zone: ZoneId): Clock = this
}

@TestConfiguration(proxyBeanMethods = false)
class StaffClockForTests {
    @Bean @Primary fun testClock() = StaffTestClock()
}

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@ActiveProfiles("test")
@Testcontainers
@Import(StaffClockForTests::class)
class StaffDirectoryIT
@Autowired
constructor(
    private val directory: StaffDirectory,
    private val access: StaffAccess,
    private val staff: StaffRepository,
    private val invitations: InvitationRepository,
    private val events: StaffEventRepository,
    private val jdbc: JdbcTemplate,
    private val clock: StaffTestClock,
) {
    private fun verified(email: String, subject: String = email) =
        VerifiedStaffIdentity("https://accounts.google.com", "synthetic-$subject", email, true)

    private fun owner(): StaffAccount {
        directory.bootstrap("owner@example.test")
        return directory.accept(verified("owner@example.test"))
    }

    @BeforeEach
    fun emptyPrivateDatabase() {
        TestData.reset(jdbc, database.jdbcUrl, authenticatedOwner = false)
        clock.time.set(Instant.parse("2026-11-06T00:00:00Z"))
    }

    @Test
    fun bootstrapIsExplicitIdempotentAndNeverSilentlyChangesTheOwner() {
        assertThat(staff.count()).isZero()
        val first = directory.bootstrap(" Owner@Example.test ")
        assertThat(directory.bootstrap("owner@example.test")).isEqualTo(first)
        assertThat(events.count()).isEqualTo(1)
        assertThat(assertThrows<DomainException> { directory.bootstrap("other@example.test") }.code)
            .isEqualTo("OWNER_ALREADY_CONFIGURED")
        assertThat(directory.accept(verified("owner@example.test")).role).isEqualTo(StaffRole.OWNER)
        assertThat(assertThrows<DomainException> { directory.bootstrap("owner@example.test") }.code)
            .isEqualTo("OWNER_ALREADY_CONFIGURED")
        assertThat(staff.count()).isEqualTo(1)
    }

    @Test
    fun packagedOwnerSetupCreatesOnlyAPendingInvitationAndStartsNoHttpListener() {
        val log = Files.createTempFile("villas-owner-setup-", ".log")
        val process =
            ProcessBuilder(
                    "${System.getProperty("java.home")}/bin/java",
                    "-jar",
                    Path.of("target", "villarosa-0.0.1-SNAPSHOT.jar").toAbsolutePath().toString(),
                    "bootstrap-owner",
                )
                .redirectErrorStream(true)
                .redirectOutput(log.toFile())
        process.environment().clear()
        process
            .environment()
            .putAll(
                mapOf(
                    "VILLAS_DB_URL" to database.jdbcUrl,
                    "VILLAS_DB_USERNAME" to database.username,
                    "VILLAS_DB_PASSWORD" to database.password,
                    "VILLAS_INITIAL_OWNER_EMAIL" to "cli-owner@example.test",
                )
            )
        val child = process.start()
        try {
            assertThat(child.waitFor(45, TimeUnit.SECONDS)).isTrue()
            assertThat(child.exitValue()).isZero()
            val output = Files.readString(log)
            assertThat(output)
                .contains("Owner invitation is ready")
                .doesNotContain("Tomcat started", "cli-owner@example.test")
            assertThat(staff.count()).isZero()
            assertThat(invitations.findAll().single().state).isEqualTo(InvitationState.PENDING)
        } finally {
            child.destroyForcibly()
            child.waitFor(10, TimeUnit.SECONDS)
            Files.deleteIfExists(log)
        }
    }

    @Test
    fun replacingAnUnclaimedBootstrapRequiresTheExplicitOfflineFlag() {
        val original = directory.bootstrap("wrong@example.test")
        val replacement = directory.bootstrap("owner@example.test", replacePending = true)
        assertThat(replacement.id).isNotEqualTo(original.id)
        assertThat(invitations.findById(original.id).get().state).isEqualTo(InvitationState.REVOKED)
        assertThat(
                assertThrows<DomainException> { directory.accept(verified("wrong@example.test")) }
                    .code
            )
            .isEqualTo("STAFF_NOT_ALLOWED")
        owner()
        assertThat(
                assertThrows<DomainException> {
                        directory.bootstrap("third@example.test", replacePending = true)
                    }
                    .code
            )
            .isEqualTo("OWNER_ALREADY_CONFIGURED")
    }

    @Test
    fun expiredInitialSetupCanBeRetriedWithoutCreatingUnverifiedAccounts() {
        val original = directory.bootstrap("expired@example.test")
        clock.time.set(original.expiresAt)
        val replacement = directory.bootstrap("owner@example.test")
        assertThat(replacement.email).isEqualTo("owner@example.test")
        assertThat(staff.count()).isZero()
        assertThat(assertThrows<DomainException> { directory.bootstrap("bad email") }.code)
            .isEqualTo("INVALID_EMAIL")
    }

    @Test
    fun onlyAnExactVerifiedInvitationCanCreateAnAccount() {
        directory.bootstrap("first.last+villas@example.test")
        for (identity in
            listOf(
                verified("firstlast+villas@example.test"),
                verified("first.last@example.test"),
                verified("first.last+villas@other.test"),
                verified("first.last+villas@example.test").copy(emailVerified = false),
            )) assertThat(assertThrows<DomainException> { directory.accept(identity) }.code)
            .isEqualTo("STAFF_NOT_ALLOWED")
        assertThat(staff.count()).isZero()
        val account = directory.accept(verified("First.Last+Villas@Example.test"))
        assertThat(account.email).isEqualTo("first.last+villas@example.test")
        assertThat(invitations.findAll().single().state).isEqualTo(InvitationState.ACCEPTED)
    }

    @Test
    fun anAcceptedEmailCannotBeReboundToAnotherProviderAccount() {
        val account = owner()
        assertThat(directory.accept(verified("owner@example.test")).id).isEqualTo(account.id)
        assertThat(
                assertThrows<DomainException> {
                        directory.accept(verified("owner@example.test", "different"))
                    }
                    .code
            )
            .isEqualTo("STAFF_NOT_ALLOWED")
        assertThat(
                assertThrows<DomainException> {
                        directory.accept(
                            verified("owner@example.test").copy(issuer = "https://other.invalid")
                        )
                    }
                    .code
            )
            .isEqualTo("STAFF_NOT_ALLOWED")
        assertThat(staff.count()).isEqualTo(1)
    }

    @Test
    fun GoogleSubjectRetainsIdentityAcrossAVerifiedEmailChange() {
        val account = owner()
        val oldIdentity = account.identity()
        val renamed = directory.accept(verified("renamed@example.test", "owner@example.test"))
        assertThat(renamed.id).isEqualTo(account.id)
        assertThat(renamed.email).isEqualTo("renamed@example.test")
        assertThat(assertThrows<DomainException> { access.current(oldIdentity) }.code)
            .isEqualTo("SESSION_REVOKED")
        assertThat(access.current(renamed.identity()).id).isEqualTo(account.id)
    }

    @Test
    fun expiredOrRevokedInvitationsCannotBeUsed() {
        val owner = owner()
        val pending = directory.invite(owner.identity(), "expired@example.test")
        assertThat(directory.invite(owner.identity(), "expired@example.test")).isEqualTo(pending)
        clock.time.set(pending.expiresAt)
        assertThat(
                assertThrows<DomainException> { directory.accept(verified("expired@example.test")) }
                    .code
            )
            .isEqualTo("STAFF_NOT_ALLOWED")
        assertThat(directory.pendingInvitations(owner.identity())).isEmpty()
        val replacement = directory.invite(owner.identity(), "expired@example.test")
        assertThat(replacement.id).isNotEqualTo(pending.id)
        val revoked =
            directory.revokeInvitation(owner.identity(), replacement.id, replacement.version)
        assertThat(revoked.state).isEqualTo(InvitationState.REVOKED)
        assertThat(
                assertThrows<DomainException> { directory.accept(verified("expired@example.test")) }
                    .code
            )
            .isEqualTo("STAFF_NOT_ALLOWED")
    }

    @Test
    fun deactivationCannotBeUndoneByReplayingAnAcceptedInvitation() {
        val one = owner()
        directory.invite(one.identity(), "second@example.test")
        val two = directory.accept(verified("second@example.test"))
        directory.deactivate(one.identity(), two.id, two.version)
        assertThat(assertThrows<DomainException> { access.current(two.identity()) }.code)
            .isEqualTo("SESSION_REVOKED")
        assertThat(
                assertThrows<DomainException> { directory.accept(verified("second@example.test")) }
                    .code
            )
            .isEqualTo("STAFF_NOT_ALLOWED")
        directory.invite(one.identity(), "second@example.test")
        val reactivated = directory.accept(verified("second@example.test"))
        assertThat(reactivated.id).isEqualTo(two.id)
        assertThat(reactivated.securityVersion).isGreaterThan(two.securityVersion)
        assertThat(directory.accounts(one.identity())).hasSize(2)
    }

    @Test
    fun reactivationRetainsTheSubjectAndAdoptsTheNewlyVerifiedEmail() {
        val owner = owner()
        directory.invite(owner.identity(), "second@example.test")
        val second = directory.accept(verified("second@example.test"))
        directory.deactivate(owner.identity(), second.id, second.version)
        directory.invite(owner.identity(), "renamed@example.test")
        val reactivated = directory.accept(verified("renamed@example.test", "second@example.test"))
        assertThat(reactivated.id).isEqualTo(second.id)
        assertThat(reactivated.email).isEqualTo("renamed@example.test")
        assertThat(staff.findByPropertyIdAndEmail("villa-rosa", "second@example.test")).isNull()
        assertThat(
                assertThrows<DomainException> {
                        directory.accept(verified("second@example.test", "different"))
                    }
                    .code
            )
            .isEqualTo("STAFF_NOT_ALLOWED")
    }

    @Test
    fun sessionRevocationInvalidatesEveryOldIdentityWithoutDeactivatingTheAccount() {
        val owner = owner()
        val old = owner.identity()
        val saved = directory.revokeSessions(old, owner.id, owner.version)
        assertThat(saved.active).isTrue()
        assertThat(saved.version).isEqualTo(1)
        assertThat(assertThrows<DomainException> { access.current(old) }.code)
            .isEqualTo("SESSION_REVOKED")
        assertThat(directory.accept(verified("owner@example.test")).identity().securityVersion)
            .isEqualTo(1)
    }

    @Test
    fun staleMissingAndForeignPropertyMutationsDoNotChangeAccounts() {
        val owner = owner()
        assertThat(
                assertThrows<DomainException> {
                        directory.deactivate(owner.identity(), owner.id, 1)
                    }
                    .code
            )
            .isEqualTo("STALE_VERSION")
        assertThat(
                assertThrows<DomainException> {
                        directory.revokeSessions(owner.identity(), owner.id, -1)
                    }
                    .code
            )
            .isEqualTo("INVALID_VERSION")
        assertThat(
                assertThrows<DomainException> {
                        directory.deactivate(owner.identity(), "missing", 0)
                    }
                    .code
            )
            .isEqualTo("NOT_FOUND")
        assertThat(
                assertThrows<DomainException> { directory.invite(owner.identity(), owner.email) }
                    .code
            )
            .isEqualTo("STAFF_ALREADY_ACTIVE")
        TestData.registerBusiness(jdbc, "other")
        TestData.registerIdentity(
            jdbc,
            "synthetic-other-person",
            "https://accounts.google.com",
            "synthetic-other",
            "other@example.test",
        )
        val other =
            staff.saveAndFlush(
                StaffAccount(
                    propertyId = "other",
                    issuer = "https://accounts.google.com",
                    subject = "synthetic-other",
                    email = "other@example.test",
                )
            )
        assertThat(assertThrows<DomainException> { access.current(other.identity()) }.code)
            .isEqualTo("SESSION_REVOKED")
        assertThat(
                assertThrows<DomainException> {
                        directory.deactivate(owner.identity(), other.id, 0)
                    }
                    .code
            )
            .isEqualTo("NOT_FOUND")
        assertThat(staff.findById(other.id).get().active).isTrue()
    }

    @Test
    fun simultaneousOwnerDeactivationsCannotRemoveTheLastOwner() {
        val one = owner()
        directory.invite(one.identity(), "second@example.test")
        val two = directory.accept(verified("second@example.test"))
        val ready = CountDownLatch(2)
        val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val futures =
                listOf(one, two).map { account ->
                    executor.submit<String> {
                        ready.countDown()
                        check(start.await(10, TimeUnit.SECONDS))
                        try {
                            directory.deactivate(account.identity(), account.id, account.version)
                            "COMMITTED"
                        } catch (error: DomainException) {
                            error.code
                        }
                    }
                }
            check(ready.await(10, TimeUnit.SECONDS))
            start.countDown()
            assertThat(futures.map { it.get(15, TimeUnit.SECONDS) })
                .containsExactlyInAnyOrder("COMMITTED", "LAST_OWNER")
            assertThat(staff.findAll().count { it.active }).isEqualTo(1)
        } finally {
            start.countDown()
            executor.shutdownNow()
            check(executor.awaitTermination(10, TimeUnit.SECONDS))
        }
    }

    @Test
    fun anAuditFailureRollsBackAccountDeactivationAndVersionChanges() {
        val owner = owner()
        directory.invite(owner.identity(), "second@example.test")
        val other = directory.accept(verified("second@example.test"))
        val eventCount = events.count()
        jdbc.execute(
            "CREATE OR REPLACE FUNCTION synthetic_staff_audit_failure_fn() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RAISE EXCEPTION 'Synthetic audit failure' USING ERRCODE='45000'; END \$\$; CREATE TRIGGER synthetic_staff_audit_failure BEFORE INSERT ON staff_events FOR EACH ROW EXECUTE FUNCTION synthetic_staff_audit_failure_fn()"
        )
        try {
            assertThrows<RuntimeException> {
                directory.deactivate(owner.identity(), other.id, other.version)
            }
            val saved = staff.findById(other.id).get()
            assertThat(saved.active).isTrue()
            assertThat(saved.version).isEqualTo(other.version)
            assertThat(saved.securityVersion).isEqualTo(other.securityVersion)
            assertThat(events.count()).isEqualTo(eventCount)
        } finally {
            jdbc.execute("DROP TRIGGER IF EXISTS synthetic_staff_audit_failure ON staff_events")
        }
    }

    @Test
    fun offlineRecoveryCreatesOnlyAnAuditedInvitationThatStillRequiresVerifiedIdentity() {
        val invite = directory.recover("recovery@example.test")
        assertThat(staff.count()).isZero()
        assertThat(directory.recover("recovery@example.test").id).isEqualTo(invite.id)
        assertThat(
                jdbc.queryForObject(
                    "SELECT kind FROM staff_events WHERE subject_id = ?",
                    String::class.java,
                    invite.id,
                )
            )
            .isEqualTo("OWNER_RECOVERY")
        val account =
            directory.accept(
                VerifiedStaffIdentity(
                    "https://accounts.google.com",
                    "recovery-subject",
                    "recovery@example.test",
                    true,
                )
            )
        assertThat(account.active).isTrue()
        assertThat(account.role).isEqualTo(StaffRole.OWNER)
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
            registry.add("spring.session.jdbc.initialize-schema") { "never" }
            registry.add("spring.datasource.url", database::getJdbcUrl)
            registry.add("spring.datasource.username", database::getUsername)
            registry.add("spring.datasource.password", database::getPassword)
            registry.add("spring.datasource.driver-class-name", database::getDriverClassName)
            registry.add("spring.jpa.hibernate.ddl-auto") { "validate" }
        }
    }
}
