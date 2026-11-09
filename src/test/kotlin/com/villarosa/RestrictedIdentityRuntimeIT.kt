package com.villarosa

import com.villarosa.security.*
import com.villarosa.service.CustomerService
import java.sql.DriverManager
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.dao.DataAccessException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@ActiveProfiles("test")
@Testcontainers
class RestrictedIdentityRuntimeIT
@Autowired
constructor(
    private val shared: SharedIdentities,
    private val directory: StaffDirectory,
    private val access: StaffAccess,
    private val customers: CustomerService,
    private val onboarding: BusinessOnboarding,
    private val jdbc: JdbcTemplate,
    private val scopes: DatabaseScope,
    manager: org.springframework.transaction.PlatformTransactionManager,
) {
    private val transactions = org.springframework.transaction.support.TransactionTemplate(manager)
    private val operator =
        JdbcTemplate(
            DriverManagerDataSource(database.jdbcUrl, database.username, database.password)
        )

    @BeforeEach
    fun fixtures() {
        TestData.reset(operator, database.jdbcUrl, authenticatedOwner = false)
        TestData.registerBusiness(operator, "runtime-lake")
        operator.update(
            "INSERT INTO staff_property_lock(property_id) SELECT 'runtime-lake' WHERE NOT EXISTS (SELECT 1 FROM staff_property_lock WHERE property_id='runtime-lake')"
        )
        for (business in listOf("villa-rosa", "runtime-lake")) operator.update(
            "INSERT INTO staff_invitations(id,property_id,email,state,created_at,expires_at) VALUES(?,?,'owner@example.test','PENDING',CURRENT_TIMESTAMP(6),CURRENT_TIMESTAMP(6)+INTERVAL '3 days')",
            java.util.UUID.randomUUID().toString(),
            business,
        )
    }

    @Test
    fun runtimeCredentialsCanSignInAndWriteButCannotEditBusinessSettingsOrOnboard() {
        assertThat(jdbc.queryForObject("SELECT current_user", String::class.java))
            .isEqualTo("villas_runtime")
        val login =
            shared.signIn(
                VerifiedStaffIdentity(
                    "https://accounts.google.com",
                    "synthetic-runtime-owner",
                    "owner@example.test",
                    true,
                )
            )
        assertThat(access.memberships(login).map { it.businessId })
            .containsExactlyInAnyOrder("villa-rosa", "runtime-lake")
        val actor = access.resolve(login, "runtime-lake")
        directory.invite(actor, "second@example.test", "runtime-lake")
        assertThat(
                operator.queryForObject(
                    "SELECT COUNT(*) FROM staff_invitations WHERE property_id='runtime-lake' AND email='second@example.test'",
                    Long::class.java,
                )
            )
            .isEqualTo(1)
        SecurityContextHolder.getContext().authentication = StaffAuthentication(login)
        try {
            BusinessScope.within(
                AuthorizedBusiness("villa-rosa", access.resolve(login, "villa-rosa"))
            ) {
                customers.createCustomer("Runtime", "Synthetic", null, null)
            }
            assertThat(
                    operator.queryForObject(
                        "SELECT actor_id FROM business_events WHERE property_id='villa-rosa' AND kind='CUSTOMER_CREATED'",
                        String::class.java,
                    )
                )
                .isEqualTo(login.memberships.getValue("villa-rosa").id)
        } finally {
            SecurityContextHolder.clearContext()
        }
        assertThat(
                transactions.execute {
                    scopes.business("runtime-lake", actor)
                    jdbc.update("UPDATE businesses SET lock_token=0 WHERE id='runtime-lake'")
                }
            )
            .isEqualTo(1)
        val invalidToken =
            assertThrows<DataAccessException> {
                transactions.execute {
                    scopes.business("runtime-lake", actor)
                    jdbc.update("UPDATE businesses SET lock_token=1 WHERE id='runtime-lake'")
                }
            }
        assertThat((invalidToken.rootCause as java.sql.SQLException).sqlState).isEqualTo("23514")
        for (column in
            listOf("name='Changed'", "active=FALSE", "currency='USD'", "version=version+1")) {
            val error =
                assertThrows<DataAccessException> {
                    jdbc.update("UPDATE businesses SET $column WHERE id='runtime-lake'")
                }
            assertThat((error.rootCause as java.sql.SQLException).sqlState).isEqualTo("42501")
        }
        val denied =
            assertThrows<DataAccessException> {
                onboarding.create("forbidden-runtime", "Forbidden", "owner@example.test")
            }
        assertThat((denied.rootCause as java.sql.SQLException).sqlState).isEqualTo("42501")
        assertThat(
                operator.queryForObject(
                    "SELECT COUNT(*) FROM businesses WHERE id='forbidden-runtime'",
                    Long::class.java,
                )
            )
            .isZero()
    }

    companion object {
        @Container @JvmField val database = TestDatabases.postgres()

        @JvmStatic
        @BeforeAll
        fun migrate() {
            DatabaseMigrations.migrate(database.jdbcUrl, database.username, database.password)
            DriverManager.getConnection(database.jdbcUrl, database.username, database.password)
                .use { connection ->
                    connection.createStatement().use { sql ->
                        sql.execute(
                            "CREATE ROLE villas_runtime LOGIN PASSWORD 'synthetic-runtime-password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO villas_runtime"
                        )
                    }
                }
            DatabaseMigrations.grantRuntime(database.jdbcUrl, database.username, database.password)
        }

        @JvmStatic
        @DynamicPropertySource
        fun properties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", database::getJdbcUrl)
            registry.add("spring.datasource.username") { "villas_runtime" }
            registry.add("spring.datasource.password") { "synthetic-runtime-password" }
            registry.add("spring.datasource.driver-class-name", database::getDriverClassName)
            registry.add("spring.jpa.hibernate.ddl-auto") { "validate" }
            registry.add("spring.session.jdbc.initialize-schema") { "never" }
        }
    }
}
