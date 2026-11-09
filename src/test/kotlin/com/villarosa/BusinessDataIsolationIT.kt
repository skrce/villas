package com.villarosa

import com.villarosa.exception.DomainException
import com.villarosa.repository.model.*
import com.villarosa.security.*
import com.villarosa.service.*
import java.sql.DriverManager
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.*
import org.junit.jupiter.api.assertThrows
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.dao.DataAccessException
import org.springframework.http.HttpMethod
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.session.jdbc.JdbcIndexedSessionRepository
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.support.TransactionTemplate
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import tools.jackson.databind.ObjectMapper

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(StaffClockForTests::class)
@Testcontainers
class BusinessDataIsolationIT
@Autowired
constructor(
    private val shared: SharedIdentities,
    private val access: StaffAccess,
    private val directory: StaffDirectory,
    private val scopes: DatabaseScope,
    private val customers: CustomerService,
    private val rooms: ApartmentService,
    private val rates: RateService,
    private val quotes: QuoteService,
    private val bookings: ReservationService,
    private val ledger: LedgerService,
    private val readiness: ReadinessService,
    private val stays: StayOperations,
    private val reports: PeriodReports,
    private val today: TodayDashboard,
    private val jdbc: JdbcTemplate,
    private val mvc: MockMvc,
    private val sessions: JdbcIndexedSessionRepository,
    private val json: ObjectMapper,
    private val clock: StaffTestClock,
    manager: PlatformTransactionManager,
) {
    private val operator =
        JdbcTemplate(
            DriverManagerDataSource(database.jdbcUrl, database.username, database.password)
        )
    private val transaction = TransactionTemplate(manager)
    private val newTransaction =
        TransactionTemplate(manager).apply {
            propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRES_NEW
        }
    private lateinit var login: StaffSessionIdentity
    private val businesses = listOf("villa-rosa", "runtime-lake")
    private val start
        get() = LocalDate.ofInstant(clock.instant(), PropertyTime.ZONE)

    private fun key() = UUID.randomUUID().toString()

    @BeforeEach
    fun fixtures() {
        clock.time.set(Instant.now())
        TestData.reset(operator, database.jdbcUrl, authenticatedOwner = false)
        for (id in businesses + "runtime-foreign") {
            TestData.registerBusiness(operator, id)
            operator.update("UPDATE businesses SET active=TRUE WHERE id=?", id)
            operator.update(
                "INSERT INTO staff_property_lock(property_id) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM staff_property_lock WHERE property_id=?)",
                id,
                id,
            )
        }
        for (id in businesses) operator.update(
            "INSERT INTO staff_invitations(id,property_id,email,state,created_at,expires_at) VALUES(?,?,'owner@example.test','PENDING',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP+INTERVAL '3 days')",
            key(),
            id,
        )
        login =
            shared.signIn(
                VerifiedStaffIdentity(
                    "https://accounts.google.com",
                    "isolation-owner",
                    "owner@example.test",
                    true,
                )
            )
    }

    @AfterEach
    fun clear() {
        SecurityContextHolder.clearContext()
        BusinessScope.clear()
    }

    private fun <T> inside(id: String, body: () -> T): T {
        val actor = access.resolve(login, id)
        val previous = SecurityContextHolder.getContext()
        SecurityContextHolder.setContext(
            SecurityContextHolder.createEmptyContext().apply {
                authentication = StaffAuthentication(login)
            }
        )
        try {
            return BusinessScope.within(AuthorizedBusiness(id, actor), body)
        } finally {
            SecurityContextHolder.setContext(previous)
        }
    }

    private fun <T : Any> sqlScope(id: String, body: () -> T): T {
        val actor = access.resolve(login, id)
        return checkNotNull(
            transaction.execute {
                scopes.business(id, actor)
                body()
            }
        )
    }

    private data class Fixture(
        val guest: Int,
        val room: Int,
        val booking: Int,
        val quote: String,
        val operation: String,
        val arrival: String,
        val departure: String,
    )

    private fun seed(id: String, operation: String = key()): Fixture =
        inside(id) {
            val room =
                rooms.create(RoomProfile("Only-$id", "ROOM-1", 2, null, null, null, null, null))
            rates.update(
                room.id!!,
                0,
                "EUR",
                5000,
                listOf(
                    SeasonRate(
                        "Peak",
                        start.plusDays(1).toString(),
                        start.plusDays(2).toString(),
                        6000,
                    )
                ),
            )
            val guest = customers.createCustomer("Only-$id", "Synthetic", null, null)
            val quote = quotes.create(room.id!!, start.toString(), start.plusDays(2).toString(), 1)
            val booking =
                bookings
                    .createQuoted(
                        guest,
                        quote.id,
                        room.id!!,
                        quote.startDate,
                        quote.endDate,
                        1,
                        operation,
                    )
                    .resourceId
            ledger.payment(
                booking,
                11000,
                "CASH",
                start.toString(),
                bookings.reservation(booking).version,
                key(),
            )
            bookings.block(
                room.id!!,
                start.plusDays(4).toString(),
                start.plusDays(5).toString(),
                "Synthetic maintenance",
                key(),
            )
            for (state in
                listOf(
                    ReadinessState.IN_PROGRESS,
                    ReadinessState.INSPECTION,
                    ReadinessState.CLEAN,
                )) {
                readiness.change(room.id!!, state, readiness.read(room.id!!).version, key(), null)
            }
            val clean = readiness.read(room.id!!)
            stays.checkIn(booking, bookings.reservation(booking).version, clean.version, key())
            Fixture(guest, room.id!!, booking, quote.id, operation, quote.startDate, quote.endDate)
        }

    @Test
    fun businessesCompleteIndependentPricedPaidStaysAndRecoverTheSameOperationKey() {
        val sameKey = key()
        val saved = businesses.associateWith { seed(it, sameKey) }
        clock.time.set(clock.instant().plusSeconds(2 * 86400))
        for ((id, f) in saved) inside(id) {
            assertThat(customers.query(null, null, false, 0, 50).items.map { it.firstName })
                .containsExactly("Only-$id")
            assertThat(rooms.getAllApartments().map { it.name }).containsExactly("Only-$id")
            assertThat(bookings.operation(OperationKind.CREATE, sameKey).resourceId)
                .isEqualTo(f.booking)
            assertThat(quotes.currentPrice(f.booking)!!.quote.price.totalCents).isEqualTo(11000)
            stays.checkOut(f.booking, bookings.reservation(f.booking).version, false, null, key())
            assertThat(readiness.read(f.room).state).isEqualTo(ReadinessState.DIRTY)
            assertThat(ledger.summary(f.booking).outstandingCents).isZero()
            val report = reports.read(ReportKind.CHARGES, f.arrival, f.departure, null)
            val csv =
                reports
                    .csv(ReportKind.CHARGES, f.arrival, f.departure, null, report.snapshotId)
                    .toString(Charsets.UTF_8)
            assertThat(csv)
                .contains("Only-$id")
                .doesNotContain("Only-${businesses.first { it!=id }}")
            assertThat(json.writeValueAsString(today.read()))
                .doesNotContain("Only-${businesses.first { it!=id }}")
            assertThat(
                    operator.queryForObject(
                        "SELECT actor_id FROM business_events WHERE property_id=? ORDER BY id LIMIT 1",
                        String::class.java,
                        id,
                    )
                )
                .isEqualTo(login.memberships.getValue(id).id)
        }
    }

    @Test
    fun everyBusinessEndpointRejectsAnUnauthorizedSelectorBeforeHandlingInput() {
        val browser = TestHttpSession.create(sessions, mvc, login)
        val contract =
            mvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk)
                .andReturn()
                .response
                .contentAsString
        var tested = 0
        for ((path, item) in json.readTree(contract).get("paths").properties()) {
            if (path.startsWith("/auth/")) continue
            for ((method, _) in item.properties()) {
                if (method !in setOf("get", "post", "put", "patch", "delete")) continue
                val concrete =
                    path.replace("{businessId}", "runtime-foreign").replace(Regex("\\{[^}]+}"), "1")
                mvc.perform(
                        request(HttpMethod.valueOf(method.uppercase()), "/api/v1$concrete")
                            .cookie(browser.cookie)
                            .header("X-Villas-Business", "runtime-foreign")
                            .header("X-CSRF-TOKEN", browser.csrf)
                            .header("Origin", "http://localhost:5173")
                            .contentType("application/json")
                            .content("{}")
                    )
                    .andExpect(status().isForbidden)
                    .andExpect(jsonPath("$.code").value("BUSINESS_ACCESS_DENIED"))
                tested++
            }
        }
        assertThat(tested).isGreaterThan(60)
    }

    @Test
    fun missingMalformedDuplicateAndConflictingSelectorsNeverFallBack() {
        val browser = TestHttpSession.create(sessions, mvc, login)
        mvc.perform(
                get("/api/v1/customers/1").cookie(browser.cookie).with {
                    it.removeHeader("X-Villas-Business")
                    it
                }
            )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value("BUSINESS_REQUIRED"))
        mvc.perform(
                get("/api/v1/apartments")
                    .cookie(browser.cookie)
                    .header("X-Villas-Business", "INVALID")
            )
            .andExpect(status().isBadRequest)
        mvc.perform(
                get("/api/v1/apartments")
                    .cookie(browser.cookie)
                    .header("X-Villas-Business", "villa-rosa", "runtime-lake")
            )
            .andExpect(status().isBadRequest)
        mvc.perform(
                get("/api/v1/businesses/runtime-lake/staff")
                    .cookie(browser.cookie)
                    .header("X-Villas-Business", "villa-rosa")
            )
            .andExpect(status().isForbidden)
    }

    @Test
    fun authorizedRequestsCannotReadForeignResourcesQuotesOrRecovery() {
        val a = seed("villa-rosa")
        val b = seed("runtime-lake")
        val browser = TestHttpSession.create(sessions, mvc, login)
        for (path in
            listOf(
                "/customers/${b.guest}",
                "/apartments/${b.room}",
                "/apartments/${b.room}/rates",
                "/apartments/${b.room}/readiness",
                "/reservations/${b.booking}",
                "/reservations/${b.booking}/allocations",
                "/reservations/${b.booking}/ledger",
                "/quotes/${b.quote}",
            )) {
            mvc.perform(
                    get("/api/v1$path")
                        .cookie(browser.cookie)
                        .header("X-Villas-Business", "villa-rosa")
                )
                .andExpect(status().isNotFound)
        }
        inside("villa-rosa") {
            assertThat(
                    assertThrows<DomainException> {
                            bookings.operation(OperationKind.CREATE, b.operation)
                        }
                        .code
                )
                .isEqualTo("OPERATION_NOT_COMMITTED")
            assertThrows<DomainException> {
                bookings.createQuoted(a.guest, b.quote, b.room, b.arrival, b.departure, 1, key())
            }
        }
        assertThat(operator.queryForObject("SELECT COUNT(*) FROM reservations", Long::class.java))
            .isEqualTo(2)
    }

    @Test
    fun unfilteredRuntimeQueriesWritesAndForeignActorsStayInsideTheDatabaseScope() {
        val a = seed("villa-rosa")
        val b = seed("runtime-lake")
        val tables =
            operator.queryForList(
                "SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='property_id' ORDER BY table_name",
                String::class.java,
            )
        assertThat(tables.size).isEqualTo(21)
        for (table in tables) {
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM $table", Long::class.java))
                .isZero()
            sqlScope("villa-rosa") {
                assertThat(
                        jdbc.queryForList(
                            "SELECT DISTINCT property_id FROM $table",
                            String::class.java,
                        )
                    )
                    .allMatch { it == "villa-rosa" }
                assertThat(
                        jdbc.queryForObject(
                            "SELECT COUNT(*) FROM $table WHERE property_id='runtime-lake'",
                            Long::class.java,
                        )
                    )
                    .isZero()
            }
        }
        sqlScope("villa-rosa") {
            assertThat(jdbc.update("UPDATE customers SET notes='forbidden' WHERE id=?", b.guest))
                .isZero()
            assertThat(jdbc.queryForList("SELECT id FROM businesses", String::class.java))
                .containsExactly("villa-rosa")
            assertThat(
                    jdbc.queryForList("SELECT property_id FROM staff_accounts", String::class.java)
                )
                .containsExactly("villa-rosa")
        }
        for (sql in
            listOf(
                "INSERT INTO customers(property_id,first_name,last_name) VALUES('runtime-lake','Forbidden','Synthetic')",
                "UPDATE customers SET property_id='runtime-lake' WHERE id=${a.guest}",
                "INSERT INTO business_events(property_id,actor_id,kind,subject_type,subject_id,occurred_at) VALUES('villa-rosa','${login.memberships.getValue("runtime-lake").id}','FORGED','CUSTOMER','${a.guest}',CURRENT_TIMESTAMP)",
            )) assertThrows<DataAccessException> { sqlScope("villa-rosa") { jdbc.update(sql) } }
        assertThat(
                operator.queryForObject(
                    "SELECT notes FROM customers WHERE id=?",
                    String::class.java,
                    b.guest,
                )
            )
            .isNull()
    }

    @Test
    fun claimsCannotRetargetATransactionOrSurvivePooledConnectionsAndRollback() {
        seed("villa-rosa")
        seed("runtime-lake")
        val a = access.resolve(login, "villa-rosa")
        val b = access.resolve(login, "runtime-lake")
        val pids = mutableSetOf<Int>()
        repeat(6) { index ->
            val id = businesses[index % 2]
            sqlScope(id) {
                pids += jdbc.queryForObject("SELECT pg_backend_pid()", Int::class.java)!!
                assertThat(
                        jdbc.queryForList("SELECT property_id FROM customers", String::class.java)
                    )
                    .containsExactly(id)
            }
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM customers", Long::class.java))
                .isZero()
        }
        assertThat(pids.size).isLessThanOrEqualTo(2)
        transaction.execute {
            scopes.business("villa-rosa", a)
            assertThrows<DomainException> { scopes.business("runtime-lake", b) }
            newTransaction.execute {
                scopes.business("runtime-lake", b)
                assertThat(
                        jdbc.queryForObject(
                            "SELECT current_setting('villas.business_id')",
                            String::class.java,
                        )
                    )
                    .isEqualTo("runtime-lake")
            }
            assertThat(
                    jdbc.queryForObject(
                        "SELECT current_setting('villas.business_id')",
                        String::class.java,
                    )
                )
                .isEqualTo("villa-rosa")
        }
        assertThrows<IllegalStateException> {
            transaction.execute {
                scopes.business("villa-rosa", a)
                error("synthetic rollback")
            }
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM customers", Long::class.java)).isZero()
    }

    @Test
    fun workersNeedExplicitBusinessAndActorContextAndCleanItAfterUse() {
        seed("villa-rosa")
        val worker = Executors.newSingleThreadExecutor()
        try {
            inside("villa-rosa") {
                assertThat(
                        worker
                            .submit<String> {
                                assertThrows<DomainException> { BusinessScope.id() }.code
                            }
                            .get(5, TimeUnit.SECONDS)
                    )
                    .isEqualTo("BUSINESS_REQUIRED")
            }
            assertThat(
                    worker
                        .submit<Int> {
                            inside("villa-rosa") {
                                customers.query(null, null, false, 0, 50).items.size
                            }
                        }
                        .get(5, TimeUnit.SECONDS)
                )
                .isEqualTo(1)
            assertThat(
                    worker
                        .submit<String> {
                            assertThrows<DomainException> { BusinessScope.id() }.code
                        }
                        .get(5, TimeUnit.SECONDS)
                )
                .isEqualTo("BUSINESS_REQUIRED")
        } finally {
            worker.shutdownNow()
        }
    }

    @Test
    fun evenEmptyReportSnapshotsAreBoundToTheirBusiness() {
        val a =
            inside("villa-rosa") {
                reports.read(
                    ReportKind.CHARGES,
                    start.toString(),
                    start.plusDays(1).toString(),
                    null,
                )
            }
        val b =
            inside("runtime-lake") {
                reports.read(
                    ReportKind.CHARGES,
                    start.toString(),
                    start.plusDays(1).toString(),
                    null,
                )
            }
        assertThat(a.snapshotId).isNotEqualTo(b.snapshotId)
        inside("runtime-lake") {
            assertThat(
                    assertThrows<DomainException> {
                            reports.csv(
                                ReportKind.CHARGES,
                                start.toString(),
                                start.plusDays(1).toString(),
                                null,
                                a.snapshotId,
                            )
                        }
                        .code
                )
                .isEqualTo("REPORT_CHANGED")
        }
    }

    @Test
    fun selfRevocationCommitsItsAuditWithoutRevokingAnotherBusiness() {
        val actor = access.resolve(login, "villa-rosa")
        directory.revokeSessions(actor, actor.id, 0, "villa-rosa")
        assertThat(access.memberships(login).map { it.businessId }).containsExactly("runtime-lake")
        assertThat(
                operator.queryForObject(
                    "SELECT COUNT(*) FROM staff_events WHERE property_id='villa-rosa' AND kind='SESSIONS_REVOKED'",
                    Long::class.java,
                )
            )
            .isEqualTo(1)
        assertThat(
                assertThrows<DomainException> {
                        inside("villa-rosa") { customers.query(null, null, false, 0, 50) }
                    }
                    .code
            )
            .isEqualTo("BUSINESS_ACCESS_DENIED")
        inside("runtime-lake") { customers.createCustomer("Still", "Authorized", null, null) }
    }

    @Test
    fun freshLoginSkipsAnInactiveMembershipAndRequiresANewInvitationToReactivateIt() {
        val member = login.memberships.getValue("runtime-lake")
        operator.update(
            "UPDATE staff_accounts SET active=FALSE,security_version=security_version+1 WHERE id=?",
            member.id,
        )
        fun fresh() =
            shared.signIn(
                VerifiedStaffIdentity(
                    "https://accounts.google.com",
                    "isolation-owner",
                    "owner@example.test",
                    true,
                )
            )
        assertThat(fresh().memberships.keys).containsExactly("villa-rosa")
        operator.update(
            "INSERT INTO staff_invitations(id,property_id,email,state,created_at,expires_at) VALUES(?,'runtime-lake','owner@example.test','PENDING',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP+INTERVAL '3 days')",
            key(),
        )
        val renewed = fresh()
        assertThat(renewed.memberships.keys).containsExactlyInAnyOrder("villa-rosa", "runtime-lake")
        assertThat(renewed.memberships.getValue("runtime-lake").id).isEqualTo(member.id)
        assertThat(access.memberships(login).map { it.businessId }).containsExactly("villa-rosa")
    }

    @Test
    fun freshLoginSkipsAnInactiveBusinessWithoutRemovingTheOtherGrant() {
        operator.update("UPDATE businesses SET active=FALSE WHERE id='runtime-lake'")
        val fresh =
            shared.signIn(
                VerifiedStaffIdentity(
                    "https://accounts.google.com",
                    "isolation-owner",
                    "owner@example.test",
                    true,
                )
            )
        assertThat(fresh.memberships.keys).containsExactly("villa-rosa")
        assertThat(access.memberships(login).map { it.businessId }).containsExactly("villa-rosa")
    }

    @Test
    fun forgedBusinessPersonAndMembershipGenerationsCannotProduceDatabaseRows() {
        seed("villa-rosa")
        seed("runtime-lake")
        val a = access.resolve(login, "villa-rosa")
        val b = access.resolve(login, "runtime-lake")
        for (forged in
            listOf(
                b,
                a.copy(personId = key()),
                a.copy(personVersion = 1),
                a.copy(securityVersion = 1),
            )) {
            transaction.execute {
                scopes.business("villa-rosa", forged)
                assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM customers", Long::class.java))
                    .isZero()
            }
        }
    }

    @Test
    fun productionRuntimeAuthorityRejectsOwnersAndChecksTheActualRestrictedRole() {
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use {
            connection ->
            assertThrows<IllegalArgumentException> {
                PropertyDatabaseBinding.verifyRuntime(connection)
            }
        }
        jdbc.execute(
            org.springframework.jdbc.core.ConnectionCallback { connection ->
                PropertyDatabaseBinding.verifyRuntime(connection)
            }
        )
    }

    @Test
    fun concurrentBusinessWorkflowsNeverBorrowAConnectionScopeOrConflict() {
        val workers = Executors.newFixedThreadPool(2)
        val sameKey = key()
        try {
            val pending = businesses.associateWith { business ->
                workers.submit<Fixture> { seed(business, sameKey) }
            }
            val saved = pending.mapValues { (_, result) -> result.get(20, TimeUnit.SECONDS) }
            for ((id, fixture) in saved) inside(id) {
                assertThat(customers.query(null, null, false, 0, 50).items.map { it.id })
                    .containsExactly(fixture.guest)
                assertThat(bookings.operation(OperationKind.CREATE, sameKey).resourceId)
                    .isEqualTo(fixture.booking)
            }
        } finally {
            workers.shutdownNow()
            check(workers.awaitTermination(10, TimeUnit.SECONDS))
        }
    }

    @Test
    fun revocationCommittedWhileARestrictedWriteWaitsPreventsAllDomainChanges() {
        val actor = access.resolve(login, "villa-rosa")
        val worker = Executors.newSingleThreadExecutor()
        try {
            DriverManager.getConnection(database.jdbcUrl, database.username, database.password)
                .use { blocker ->
                    blocker.autoCommit = false
                    blocker
                        .prepareStatement(
                            "UPDATE staff_accounts SET security_version=security_version+1 WHERE id=?"
                        )
                        .use {
                            it.setString(1, actor.id)
                            it.executeUpdate()
                        }
                    val result =
                        worker.submit<String> {
                            try {
                                inside("villa-rosa") {
                                    customers.createCustomer("Must not", "Commit", null, null)
                                }
                                "COMMITTED"
                            } catch (failure: DomainException) {
                                failure.code
                            }
                        }
                    try {
                        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5)
                        var blocked = false
                        while (System.nanoTime() < deadline) {
                            val waiting =
                                operator.queryForObject(
                                    "SELECT COUNT(*) FROM pg_stat_activity WHERE datname=current_database() AND usename='villas_runtime' AND wait_event_type='Lock'",
                                    Long::class.java,
                                )!!
                            if (waiting > 0) {
                                blocked = true
                                break
                            }
                            Thread.sleep(25)
                        }
                        check(blocked) {
                            "The restricted write did not reach the expected database lock."
                        }
                        blocker.commit()
                        assertThat(result.get(10, TimeUnit.SECONDS)).isEqualTo("SESSION_REVOKED")
                    } finally {
                        blocker.rollback()
                    }
                }
            assertThat(
                    operator.queryForObject(
                        "SELECT COUNT(*) FROM customers WHERE first_name='Must not'",
                        Long::class.java,
                    )
                )
                .isZero()
            inside("runtime-lake") { customers.createCustomer("Still", "Authorized", null, null) }
        } finally {
            worker.shutdownNow()
            check(worker.awaitTermination(10, TimeUnit.SECONDS))
        }
    }

    @Test
    fun productionGuardRejectsAnUnprotectedFutureTenantTable() {
        operator.execute("CREATE TABLE s3_unprotected(property_id VARCHAR(64))")
        try {
            assertThrows<IllegalArgumentException> {
                jdbc.execute(
                    org.springframework.jdbc.core.ConnectionCallback { connection ->
                        PropertyDatabaseBinding.verifyRuntime(connection)
                    }
                )
            }
        } finally {
            operator.execute("DROP TABLE s3_unprotected")
        }
    }

    companion object {
        @Container @JvmField val database = TestDatabases.postgres()

        @JvmStatic
        @BeforeAll
        fun migrate() {
            DatabaseMigrations.migrate(database.jdbcUrl, database.username, database.password)
            DriverManager.getConnection(database.jdbcUrl, database.username, database.password)
                .use {
                    it.createStatement().use { sql ->
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
            registry.add("spring.datasource.hikari.maximum-pool-size") { "2" }
            registry.add("spring.jpa.hibernate.ddl-auto") { "validate" }
            registry.add("spring.session.jdbc.initialize-schema") { "never" }
        }
    }
}
