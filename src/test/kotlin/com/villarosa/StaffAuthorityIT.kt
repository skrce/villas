package com.villarosa

import com.villarosa.exception.DomainException
import com.villarosa.security.*
import com.villarosa.service.CustomerService
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.core.context.SecurityContextHolder
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
class StaffAuthorityIT
@Autowired
constructor(
    private val customers: CustomerService,
    private val jdbc: JdbcTemplate,
    private val transactions: PlatformTransactionManager,
) {
    @BeforeEach
    fun fixtures() {
        TestData.reset(jdbc, database.jdbcUrl)
        TestData.seedOwner(jdbc, index = 1)
    }

    @Test
    fun aGuestWriteRechecksOwnerRevocationAfterWaitingForItsRowLock() {
        val ready = CountDownLatch(1)
        val executor = Executors.newSingleThreadExecutor()
        lateinit var result: java.util.concurrent.Future<String>
        try {
            TransactionTemplate(transactions).executeWithoutResult {
                jdbc.queryForObject(
                    "SELECT id FROM staff_accounts WHERE id=? FOR UPDATE",
                    String::class.java,
                    TestData.ownerIdentity().id,
                )
                result =
                    executor.submit<String> {
                        SecurityContextHolder.getContext().authentication =
                            StaffAuthentication(TestData.ownerIdentity())
                        ready.countDown()
                        try {
                            customers.createCustomer("Test", "Synthetic", "000", "Synthetic")
                            "COMMITTED"
                        } catch (failure: DomainException) {
                            failure.code
                        } finally {
                            SecurityContextHolder.clearContext()
                        }
                    }
                check(ready.await(10, TimeUnit.SECONDS))
                jdbc.update(
                    "UPDATE staff_accounts SET security_version=security_version+1 WHERE id=?",
                    TestData.ownerIdentity().id,
                )
            }
            assertThat(result.get(15, TimeUnit.SECONDS)).isEqualTo("SESSION_REVOKED")
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM customers", Long::class.java))
                .isZero()
            assertThat(
                    jdbc.queryForObject("SELECT COUNT(*) FROM business_events", Long::class.java)
                )
                .isZero()
        } finally {
            executor.shutdownNow()
            check(executor.awaitTermination(10, TimeUnit.SECONDS))
        }
    }

    @Test
    fun packagedRecoveryUsesOnlyDatabaseAuthorityAndCreatesNoHttpOrStaffAccount() {
        val log = Files.createTempFile("villas-owner-recovery-", ".log")
        fun recover() {
            val builder =
                ProcessBuilder(
                        "${System.getProperty("java.home")}/bin/java",
                        "-jar",
                        Path.of("target", "villarosa-0.0.1-SNAPSHOT.jar")
                            .toAbsolutePath()
                            .toString(),
                        "recover-owner",
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
                        "VILLAS_INITIAL_OWNER_EMAIL" to "recovery@example.test",
                    )
                )
            val process = builder.start()
            try {
                assertThat(process.waitFor(45, TimeUnit.SECONDS)).isTrue()
                assertThat(process.exitValue()).isZero()
                assertThat(Files.readString(log))
                    .contains("Owner invitation is ready")
                    .doesNotContain("Tomcat started", "recovery@example.test")
            } finally {
                process.destroyForcibly()
                process.waitFor(10, TimeUnit.SECONDS)
            }
        }
        try {
            recover()
            val id =
                jdbc.queryForObject(
                    "SELECT id FROM staff_invitations WHERE email=?",
                    String::class.java,
                    "recovery@example.test",
                )
            recover()
            assertThat(
                    jdbc.queryForObject(
                        "SELECT id FROM staff_invitations WHERE email=?",
                        String::class.java,
                        "recovery@example.test",
                    )
                )
                .isEqualTo(id)
            assertThat(
                    jdbc.queryForObject("SELECT COUNT(*) FROM staff_invitations", Long::class.java)
                )
                .isEqualTo(1)
            assertThat(
                    jdbc.queryForObject(
                        "SELECT COUNT(*) FROM staff_events WHERE kind='OWNER_RECOVERY'",
                        Long::class.java,
                    )
                )
                .isEqualTo(1)
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM staff_accounts", Long::class.java))
                .isEqualTo(2)
        } finally {
            Files.deleteIfExists(log)
        }
    }

    @Test
    fun guestCreationRollsBackWhenItsAuditCannotCommit() {
        jdbc.execute(
            "CREATE TRIGGER reject_guest_audit BEFORE INSERT ON business_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic audit failure'"
        )
        try {
            org.assertj.core.api.Assertions.assertThatThrownBy {
                    customers.createCustomer("Test", "Guest", "000", "Synthetic")
                }
                .isInstanceOf(org.springframework.dao.DataAccessException::class.java)
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM customers", Long::class.java))
                .isZero()
            assertThat(
                    jdbc.queryForObject("SELECT COUNT(*) FROM business_events", Long::class.java)
                )
                .isZero()
        } finally {
            jdbc.execute("DROP TRIGGER reject_guest_audit")
        }
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
