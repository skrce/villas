package com.villarosa

import com.villarosa.exception.DomainException
import com.villarosa.security.*
import java.nio.file.Files
import java.nio.file.Path
import java.time.Instant
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.*
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@ActiveProfiles("test")
@Testcontainers
@Import(StaffClockForTests::class)
class SharedIdentitiesIT
@Autowired
constructor(
    private val shared: SharedIdentities,
    private val directory: StaffDirectory,
    private val access: StaffAccess,
    private val onboarding: BusinessOnboarding,
    private val jdbc: JdbcTemplate,
    private val transactions: PlatformTransactionManager,
    private val clock: StaffTestClock,
    private val customers: com.villarosa.service.CustomerService,
) {
    private lateinit var business: String

    private fun verified(
        email: String = "owner@example.test",
        subject: String = "synthetic-owner",
    ) = VerifiedStaffIdentity("https://accounts.google.com", subject, email, true)

    @BeforeEach
    fun reset() {
        TestData.reset(jdbc, database.jdbcUrl, authenticatedOwner = false)
        clock.time.set(Instant.parse("2026-11-08T12:00:00.123456Z"))
        business = "lake-${UUID.randomUUID().toString().take(8)}"
    }

    private fun both(): StaffSessionIdentity {
        directory.bootstrap("owner@example.test", businessId = "villa-rosa")
        onboarding.create(business, "Синтетичко езеро", "owner@example.test")
        return shared.signIn(verified())
    }

    private fun count(sql: String, vararg values: Any) =
        jdbc.queryForObject(sql, Long::class.java, *values)!!

    private fun code(action: () -> Unit) = assertThrows<DomainException> { action() }.code

    @Test
    fun oneGoogleIdentityHasIndependentMembershipsWithoutRewritingTheirIds() {
        val login = both()
        val views = access.memberships(login)
        assertThat(views.map { it.businessId }).containsExactlyInAnyOrder("villa-rosa", business)
        assertThat(views.map { it.staff.id }.distinct()).hasSize(2)
        assertThat(count("SELECT COUNT(*) FROM staff_identities")).isEqualTo(1)
        assertThat(count("SELECT COUNT(*) FROM staff_accounts")).isEqualTo(2)
        assertThat(count("SELECT COUNT(*) FROM staff_invitations WHERE state='ACCEPTED'"))
            .isEqualTo(2)
        val repeated = shared.signIn(verified())
        assertThat(repeated).isEqualTo(login)
        assertThat(count("SELECT COUNT(*) FROM staff_events WHERE kind='INVITATION_ACCEPTED'"))
            .isEqualTo(2)
        assertThat(onboarding.create(business, "Синтетичко езеро", "owner@example.test"))
            .isEqualTo(InvitationState.ACCEPTED)
    }

    @Test
    fun revocationAndDeactivationAffectOnlyTheSelectedMembershipAndReactivationNeedsANewInvite() {
        val login = both()
        for (id in listOf("villa-rosa", business)) directory.invite(
            access.resolve(login, id),
            "second@example.test",
            id,
        )
        val second = shared.signIn(verified("second@example.test", "synthetic-second"))
        val own = login.memberships.getValue(business)
        directory.revokeSessions(access.resolve(second, business), own.id, 0, business)
        assertThat(code { access.resolve(login, business) }).isEqualTo("BUSINESS_ACCESS_DENIED")
        assertThat(access.resolve(login, "villa-rosa").id)
            .isEqualTo(login.memberships.getValue("villa-rosa").id)
        assertThat(access.memberships(login).map { it.businessId }).containsExactly("villa-rosa")
        val refreshed = shared.signIn(verified())
        val version = access.current(access.resolve(refreshed, business), business).version
        directory.deactivate(access.resolve(second, business), own.id, version, business)
        val inactive = shared.signIn(verified())
        assertThat(inactive.memberships.keys).containsExactly("villa-rosa")
        directory.invite(access.resolve(second, business), "owner@example.test", business)
        val reactivated = shared.signIn(verified())
        assertThat(access.resolve(reactivated, business).id).isEqualTo(own.id)
        assertThat(code { access.resolve(refreshed, business) }).isEqualTo("BUSINESS_ACCESS_DENIED")
        assertThat(access.resolve(login, "villa-rosa").id)
            .isEqualTo(login.memberships.getValue("villa-rosa").id)
    }

    @Test
    fun forgedGrantsUnrelatedBusinessesAndInactiveBusinessesNeverExposeMembershipMetadata() {
        val login = both()
        val unrelated = "other-${UUID.randomUUID().toString().take(8)}"
        onboarding.create(unrelated, "Unrelated private name", "different@example.test")
        val other = shared.signIn(verified("different@example.test", "synthetic-different"))
        assertThat(code { access.resolve(login, unrelated) }).isEqualTo("BUSINESS_ACCESS_DENIED")
        val forged =
            login.copy(memberships = mapOf(unrelated to other.memberships.getValue(unrelated)))
        assertThat(code { access.resolve(forged, unrelated) }).isEqualTo("BUSINESS_ACCESS_DENIED")
        assertThat(code { access.resolve(login, "INVALID") }).isEqualTo("INVALID_BUSINESS")
        jdbc.update("UPDATE businesses SET active=FALSE WHERE id=?", business)
        assertThat(access.memberships(login).map { it.businessId }).containsExactly("villa-rosa")
        assertThat(shared.signIn(verified()).memberships.keys).containsExactly("villa-rosa")
        assertThat(code { access.resolve(login, business) }).isEqualTo("BUSINESS_ACCESS_DENIED")
    }

    @Test
    fun verifiedRenameKeepsIdentityAndMembershipIdsWhileRevokingOlderLogins() {
        val original = both()
        val renamed = shared.signIn(verified("renamed@example.test"))
        assertThat(renamed.id).isEqualTo(original.id)
        assertThat(renamed.memberships.mapValues { it.value.id })
            .isEqualTo(original.memberships.mapValues { it.value.id })
        assertThat(access.person(renamed).email).isEqualTo("renamed@example.test")
        assertThat(code { access.person(original) }).isEqualTo("SESSION_REVOKED")
        assertThat(code { shared.signIn(verified("renamed@example.test", "different-subject")) })
            .isEqualTo("STAFF_NOT_ALLOWED")
        assertThat(count("SELECT COUNT(*) FROM staff_identities")).isEqualTo(1)
        assertThat(count("SELECT COUNT(*) FROM staff_events WHERE kind='STAFF_EMAIL_CHANGED'"))
            .isEqualTo(2)
    }

    @Test
    fun eachBusinessRetainsItsLastOwnerAndForeignResourceIdsCannotBeMutated() {
        val login = both()
        val member = login.memberships.getValue(business)
        assertThat(
                code {
                    directory.deactivate(access.resolve(login, business), member.id, 0, business)
                }
            )
            .isEqualTo("LAST_OWNER")
        assertThat(
                code {
                    directory.deactivate(
                        access.resolve(login, "villa-rosa"),
                        member.id,
                        0,
                        "villa-rosa",
                    )
                }
            )
            .isEqualTo("NOT_FOUND")
        assertThat(access.memberships(login)).hasSize(2)
    }

    @Test
    fun concurrentFirstSignInsCreateOneIdentityAndConsumeEachInvitationOnce() {
        directory.bootstrap("owner@example.test", businessId = "villa-rosa")
        onboarding.create(business, "Synthetic lake", "owner@example.test")
        val executor = Executors.newFixedThreadPool(2)
        try {
            val results =
                (1..2)
                    .map { executor.submit<StaffSessionIdentity> { shared.signIn(verified()) } }
                    .map { it.get(15, TimeUnit.SECONDS) }
            assertThat(results[0]).isEqualTo(results[1])
            assertThat(count("SELECT COUNT(*) FROM staff_identities")).isEqualTo(1)
            assertThat(count("SELECT COUNT(*) FROM staff_accounts")).isEqualTo(2)
            assertThat(count("SELECT COUNT(*) FROM staff_events WHERE kind='INVITATION_ACCEPTED'"))
                .isEqualTo(2)
        } finally {
            executor.shutdownNow()
            check(executor.awaitTermination(10, TimeUnit.SECONDS))
        }
    }

    private fun awaitBlocked(table: String, minimum: Long = 1) {
        java.sql.DriverManager.getConnection(database.jdbcUrl, database.username, database.password)
            .use { observer ->
                val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10)
                while (System.nanoTime() < deadline) {
                    val blocked =
                        observer
                            .prepareStatement(
                                "SELECT COUNT(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE ?"
                            )
                            .use { statement ->
                                statement.setString(1, "%$table%")
                                statement.executeQuery().use { rows ->
                                    check(rows.next())
                                    rows.getLong(1)
                                }
                            }
                    if (blocked >= minimum) return
                    Thread.sleep(20)
                }
                error("The synthetic operation did not reach the expected database lock.")
            }
    }

    @ParameterizedTest
    @ValueSource(booleans = [false, true])
    fun signInRechecksRevocationAfterWaitingForTheBusinessLock(existing: Boolean) {
        onboarding.create(business, "Synthetic lake", "owner@example.test")
        if (existing) shared.signIn(verified())
        val executor = Executors.newSingleThreadExecutor()
        lateinit var result: java.util.concurrent.Future<String>
        try {
            TransactionTemplate(transactions).executeWithoutResult {
                jdbc.queryForObject(
                    "SELECT property_id FROM staff_property_lock WHERE property_id=? FOR UPDATE",
                    String::class.java,
                    business,
                )
                if (existing)
                    jdbc.update(
                        "UPDATE staff_accounts SET active=FALSE,security_version=security_version+1 WHERE property_id=?",
                        business,
                    )
                else
                    jdbc.update(
                        "UPDATE staff_invitations SET state='REVOKED' WHERE property_id=? AND state='PENDING'",
                        business,
                    )
                result =
                    executor.submit<String> {
                        try {
                            shared.signIn(verified())
                            "ADMITTED"
                        } catch (failure: DomainException) {
                            failure.code
                        }
                    }
                awaitBlocked("staff_property_lock")
            }
            assertThat(result.get(15, TimeUnit.SECONDS)).isEqualTo("STAFF_NOT_ALLOWED")
            assertThat(
                    count(
                        "SELECT COUNT(*) FROM staff_accounts WHERE property_id=? AND active",
                        business,
                    )
                )
                .isZero()
            if (!existing) assertThat(count("SELECT COUNT(*) FROM staff_identities")).isZero()
        } finally {
            executor.shutdownNow()
            check(executor.awaitTermination(10, TimeUnit.SECONDS))
        }
    }

    @Test
    fun aBusinessWriteRechecksMembershipGenerationAfterWaitingForItsRow() {
        onboarding.create(business, "Synthetic lake", "owner@example.test")
        val login = shared.signIn(verified())
        val actor = access.resolve(login, business)
        val executor = Executors.newSingleThreadExecutor()
        lateinit var result: java.util.concurrent.Future<String>
        try {
            TransactionTemplate(transactions).executeWithoutResult {
                jdbc.queryForObject(
                    "SELECT id FROM staff_accounts WHERE property_id=? AND id=? FOR UPDATE",
                    String::class.java,
                    business,
                    actor.id,
                )
                jdbc.update(
                    "UPDATE staff_accounts SET security_version=security_version+1 WHERE property_id=? AND id=?",
                    business,
                    actor.id,
                )
                result =
                    executor.submit<String> {
                        try {
                            directory.invite(actor, "new@example.test", business)
                            "COMMITTED"
                        } catch (failure: DomainException) {
                            failure.code
                        }
                    }
                awaitBlocked("staff_accounts")
            }
            assertThat(result.get(15, TimeUnit.SECONDS)).isEqualTo("BUSINESS_ACCESS_DENIED")
            assertThat(
                    count(
                        "SELECT COUNT(*) FROM staff_invitations WHERE property_id=? AND email='new@example.test'",
                        business,
                    )
                )
                .isZero()
        } finally {
            executor.shutdownNow()
            check(executor.awaitTermination(10, TimeUnit.SECONDS))
        }
    }

    @Test
    fun onboardingRetriesObserveTheRecordedInvitationAndNeverReissueOrChangeAnExistingBusiness() {
        assertThat(onboarding.create(business, "  Synthetic lake  ", " Owner@Example.test "))
            .isEqualTo(InvitationState.PENDING)
        assertThat(onboarding.create(business, "Synthetic lake", "owner@example.test"))
            .isEqualTo(InvitationState.PENDING)
        assertThat(count("SELECT COUNT(*) FROM staff_invitations WHERE property_id=?", business))
            .isEqualTo(1)
        assertThat(
                count(
                    "SELECT COUNT(*) FROM staff_events WHERE property_id=? AND kind='BUSINESS_ONBOARDED'",
                    business,
                )
            )
            .isEqualTo(1)
        assertThat(code { onboarding.create(business, "Changed", "owner@example.test") })
            .isEqualTo("ONBOARDING_MISMATCH")
        clock.time.set(clock.instant().plus(StaffDirectory.INVITATION_TTL))
        assertThat(onboarding.create(business, "Synthetic lake", "owner@example.test"))
            .isEqualTo(InvitationState.EXPIRED)
        assertThat(count("SELECT COUNT(*) FROM staff_accounts")).isZero()
        assertThat(count("SELECT COUNT(*) FROM staff_identities")).isZero()
    }

    @Test
    fun onboardingRollsBackTheBusinessInvitationAndReceiptWhenItsAuditFails() {
        jdbc.execute(
            "CREATE FUNCTION fail_onboarding_audit() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RAISE EXCEPTION 'Synthetic audit failure'; END \$\$; CREATE TRIGGER fail_onboarding_audit BEFORE INSERT ON staff_events FOR EACH ROW EXECUTE FUNCTION fail_onboarding_audit()"
        )
        try {
            assertThrows<org.springframework.dao.DataAccessException> {
                onboarding.create(business, "Synthetic lake", "owner@example.test")
            }
            assertThat(count("SELECT COUNT(*) FROM businesses WHERE id=?", business)).isZero()
            assertThat(
                    count("SELECT COUNT(*) FROM staff_property_lock WHERE property_id=?", business)
                )
                .isZero()
            assertThat(
                    count("SELECT COUNT(*) FROM staff_invitations WHERE property_id=?", business)
                )
                .isZero()
            assertThat(
                    count("SELECT COUNT(*) FROM business_onboarding WHERE property_id=?", business)
                )
                .isZero()
        } finally {
            jdbc.execute(
                "DROP TRIGGER fail_onboarding_audit ON staff_events; DROP FUNCTION fail_onboarding_audit()"
            )
        }
        assertThat(onboarding.create(business, "Synthetic lake", "owner@example.test"))
            .isEqualTo(InvitationState.PENDING)
    }

    @Test
    fun packagedOnboardingRequiresDatabaseAuthorityAndStartsNoHttpOrPasswordAccount() {
        val log = Files.createTempFile("villas-shared-onboarding-", ".log")
        try {
            repeat(2) {
                val builder =
                    ProcessBuilder(
                            "${System.getProperty("java.home")}/bin/java",
                            "-jar",
                            Path.of("target", "villarosa-0.0.1-SNAPSHOT.jar")
                                .toAbsolutePath()
                                .toString(),
                            "onboard-business",
                        )
                        .redirectErrorStream(true)
                        .redirectOutput(log.toFile())
                builder.environment().clear()
                builder
                    .environment()
                    .putAll(
                        mapOf(
                            "VILLAS_DB_URL" to database.jdbcUrl,
                            "VILLAS_DB_USERNAME" to database.username,
                            "VILLAS_DB_PASSWORD" to database.password,
                            "VILLAS_NEW_BUSINESS_ID" to business,
                            "VILLAS_NEW_BUSINESS_NAME" to "Synthetic private name",
                            "VILLAS_INITIAL_OWNER_EMAIL" to "owner@example.test",
                        )
                    )
                val process = builder.start()
                try {
                    assertThat(process.waitFor(45, TimeUnit.SECONDS)).isTrue()
                    assertThat(process.exitValue()).isZero()
                    assertThat(Files.readString(log))
                        .contains("Owner invitation status: PENDING")
                        .doesNotContain(
                            "Tomcat started",
                            "owner@example.test",
                            "Synthetic private name",
                            business,
                        )
                } finally {
                    process.destroyForcibly()
                    process.waitFor(10, TimeUnit.SECONDS)
                }
            }
            assertThat(
                    count("SELECT COUNT(*) FROM business_onboarding WHERE property_id=?", business)
                )
                .isEqualTo(1)
            assertThat(count("SELECT COUNT(*) FROM staff_accounts")).isZero()
            assertThat(count("SELECT COUNT(*) FROM staff_identities")).isZero()
        } finally {
            Files.deleteIfExists(log)
        }
    }

    @Test
    fun aSecondBusinessAuditFailureRollsBackTheEntireLoginAdmission() {
        directory.bootstrap("owner@example.test", businessId = "villa-rosa")
        onboarding.create(business, "Synthetic lake", "owner@example.test")
        jdbc.execute(
            "CREATE FUNCTION reject_second_admission() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN IF NEW.kind='INVITATION_ACCEPTED' AND NEW.property_id='villa-rosa' THEN RAISE EXCEPTION 'Synthetic admission failure'; END IF; RETURN NEW; END \$\$; CREATE TRIGGER reject_second_admission BEFORE INSERT ON staff_events FOR EACH ROW EXECUTE FUNCTION reject_second_admission()"
        )
        try {
            assertThrows<org.springframework.dao.DataAccessException> { shared.signIn(verified()) }
            assertThat(count("SELECT COUNT(*) FROM staff_identities")).isZero()
            assertThat(count("SELECT COUNT(*) FROM staff_accounts")).isZero()
            assertThat(count("SELECT COUNT(*) FROM staff_invitations WHERE state='PENDING'"))
                .isEqualTo(2)
            assertThat(count("SELECT COUNT(*) FROM staff_events WHERE kind='INVITATION_ACCEPTED'"))
                .isZero()
        } finally {
            jdbc.execute(
                "DROP TRIGGER reject_second_admission ON staff_events; DROP FUNCTION reject_second_admission()"
            )
        }
        assertThat(shared.signIn(verified()).memberships).hasSize(2)
    }

    @Test
    fun aBusinessDeactivationCommittedWhileAStaffWriteWaitsPreventsTheWrite() {
        val login = both()
        val actor = access.resolve(login, business)
        val executor = Executors.newSingleThreadExecutor()
        lateinit var result: java.util.concurrent.Future<String>
        try {
            TransactionTemplate(transactions).executeWithoutResult {
                jdbc.update("UPDATE businesses SET active=FALSE WHERE id=?", business)
                result =
                    executor.submit<String> {
                        try {
                            directory.invite(actor, "blocked@example.test", business)
                            "COMMITTED"
                        } catch (failure: DomainException) {
                            failure.code
                        }
                    }
                awaitBlocked("businesses")
            }
            assertThat(result.get(15, TimeUnit.SECONDS)).isEqualTo("BUSINESS_ACCESS_DENIED")
            assertThat(
                    count(
                        "SELECT COUNT(*) FROM staff_invitations WHERE property_id=? AND email='blocked@example.test'",
                        business,
                    )
                )
                .isZero()
            assertThat(access.resolve(login, "villa-rosa").id)
                .isEqualTo(login.memberships.getValue("villa-rosa").id)
        } finally {
            executor.shutdownNow()
            check(executor.awaitTermination(10, TimeUnit.SECONDS))
        }
    }

    @Test
    fun aVerifiedRenameWinsItsLockBeforeAnOldSessionBusinessWrite() {
        val login = both()
        val executor = Executors.newFixedThreadPool(2)
        lateinit var renamed: java.util.concurrent.Future<StaffSessionIdentity>
        lateinit var result: java.util.concurrent.Future<String>
        try {
            TransactionTemplate(transactions).executeWithoutResult {
                jdbc.queryForObject(
                    "SELECT id FROM staff_identities WHERE id=? FOR UPDATE",
                    String::class.java,
                    login.id,
                )
                renamed =
                    executor.submit<StaffSessionIdentity> {
                        shared.signIn(verified("renamed@example.test"))
                    }
                awaitBlocked("staff_identities")
                result =
                    executor.submit<String> {
                        org.springframework.security.core.context.SecurityContextHolder.getContext()
                            .authentication = StaffAuthentication(login)
                        try {
                            BusinessScope.within(
                                AuthorizedBusiness(
                                    "villa-rosa",
                                    login.memberships
                                        .getValue("villa-rosa")
                                        .copy(
                                            personId = login.id,
                                            personVersion = login.securityVersion,
                                        ),
                                )
                            ) {
                                customers.createCustomer("Must not", "Commit", null, null)
                            }
                            "COMMITTED"
                        } catch (failure: DomainException) {
                            failure.code
                        } finally {
                            org.springframework.security.core.context.SecurityContextHolder
                                .clearContext()
                        }
                    }
                awaitBlocked("staff_identities", 2)
            }
            assertThat(renamed.get(15, TimeUnit.SECONDS).securityVersion)
                .isEqualTo(login.securityVersion + 1)
            assertThat(result.get(15, TimeUnit.SECONDS)).isEqualTo("SESSION_REVOKED")
            assertThat(count("SELECT COUNT(*) FROM customers")).isZero()
        } finally {
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
