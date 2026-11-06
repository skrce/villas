package com.villarosa

import com.villarosa.repository.ApartmentRepository
import com.villarosa.repository.CustomerRepository
import com.villarosa.repository.ReservationRepository
import com.villarosa.repository.model.Apartment
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.sql.DriverManager
import java.util.Base64
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.builder.SpringApplicationBuilder
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Testcontainers
class MariaDbIT
@Autowired
constructor(
    private val jdbc: JdbcTemplate,
    private val apartments: ApartmentRepository,
    private val customers: CustomerRepository,
    private val reservations: ReservationRepository,
    @LocalServerPort private val port: Int,
) {
    private val http = HttpClient.newHttpClient()

    @BeforeEach
    fun clearPrivateContainerFixtures() {
        TestData.reset(jdbc, database.jdbcUrl)
    }

    @Test
    fun schemaStartsWithoutBusinessRecords() {
        assertThat(bootstrapRows)
            .containsExactlyInAnyOrderEntriesOf(
                mapOf(
                    "apartments" to 0L,
                    "customers" to 0L,
                    "reservations" to 0L,
                    "maintenance_blocks" to 0L,
                    "inventory_operations" to 0L,
                    "inventory_events" to 0L,
                    "staff_accounts" to 0L,
                    "staff_invitations" to 0L,
                    "staff_events" to 0L,
                )
            )
    }

    @Test
    fun productionStartupValidatesTheEmptySchemaWithoutLoadingDemoData() {
        SpringApplicationBuilder(Application::class.java)
            .run(
                "--spring.datasource.url=${database.jdbcUrl}",
                "--spring.datasource.username=${database.username}",
                "--spring.datasource.password=${database.password}",
                "--villas.mode=production",
                "--server.port=0",
            )
            .use { production ->
                assertThat(production.environment.getProperty("spring.jpa.hibernate.ddl-auto"))
                    .isEqualTo("validate")
                assertThat(production.environment.getProperty("spring.sql.init.mode"))
                    .isEqualTo("never")
                assertThat(production.environment.getProperty("springdoc.api-docs.enabled"))
                    .isEqualTo("false")
                val productionPort = production.environment.getProperty("local.server.port")
                val request =
                    HttpRequest.newBuilder(
                            URI("http://127.0.0.1:$productionPort/api/v1/apartments")
                        )
                        .build()
                assertThat(http.send(request, HttpResponse.BodyHandlers.ofString()).statusCode())
                    .isEqualTo(401)
                assertThat(apartments.count()).isZero()
                assertThat(customers.count()).isZero()
                assertThat(reservations.count()).isZero()
            }
    }

    @Test
    fun canonicalHttpWorkflowPersistsUnicodeAndSupportsGeneratedClientPaths() {
        val guest =
            request(
                "POST",
                "/api/v1/customers?firstName=Test&lastName=%D0%93%D0%BE%D1%81%D1%82%D0%B8%D0%BD&phone=000&address=Synthetic",
            )
        assertThat(guest.statusCode()).isEqualTo(200)
        val first = apartments.save(Apartment(null, 2, "South", "Езеро", 100, 150))
        val second = apartments.save(Apartment(null, 2, "East", "Garden", 100, 150))
        val created =
            request(
                "POST",
                "/api/v1/reservations?customerId=${guest.body()}&roomId=${first.id}&startDate=2026-11-06&endDate=2026-11-09",
            )
        assertThat(created.statusCode()).isEqualTo(200)
        val id = created.body().toInt()

        assertThat(request("GET", "/api/v1/customers?firstName=Test").body()).contains("Гостин")
        assertThat(request("GET", "/api/v1/apartments").body()).contains("Езеро")
        val moved =
            request(
                "PATCH",
                "/api/v1/reservations?reservationId=$id&newRoomId=${second.id}&expectedVersion=0",
            )
        assertThat(moved.statusCode()).isEqualTo(200)
        assertThat(reservations.findById(id).get().roomId).isEqualTo(second.id)
        assertThat(
                request("DELETE", "/api/v1/reservations?reservationId=$id&expectedVersion=1")
                    .statusCode()
            )
            .isEqualTo(200)
        assertThat(reservations.findById(id).get().status)
            .isEqualTo(com.villarosa.repository.model.ReservationStatus.CANCELLED)
    }

    @Test
    fun invalidInputProducesJsonInsteadOfAnInternalServerError() {
        val response =
            request(
                "POST",
                "/api/v1/customers?firstName=&lastName=Example&phone=000&address=Synthetic",
            )
        assertThat(response.statusCode()).isEqualTo(400)
        assertThat(response.body()).contains("INVALID_REQUEST").doesNotContain("stackTrace")
    }

    @Test
    fun missingAndInvalidCredentialsProduceTheAuthenticationEnvelope() {
        listOf(null, "test:incorrect").forEach { credentials ->
            val response = request("GET", "/api/v1/apartments", credentials)
            assertThat(response.statusCode()).isEqualTo(401)
            assertThat(response.body()).contains("AUTHENTICATION_REQUIRED")
        }
    }

    @Test
    fun missingRoomIsAClientErrorBeforeTheForeignKeyWrite() {
        val guest =
            customers.save(
                com.villarosa.repository.model.Customer.buildCustomer(
                    "Test",
                    "Guest",
                    "000",
                    "Synthetic",
                )
            )
        val response =
            request(
                "POST",
                "/api/v1/reservations?customerId=${guest.id}&roomId=999999&startDate=2026-11-06&endDate=2026-11-09",
            )
        assertThat(response.statusCode()).isEqualTo(404)
        assertThat(response.body()).contains("NOT_FOUND").contains("Room does not exist.")
        assertThat(reservations.count()).isZero()
    }

    @Test
    fun canonicalWritesRequireKeysAndVersionsAndReplayTheOriginalOutcome() {
        val guest =
            customers.save(
                com.villarosa.repository.model.Customer.buildCustomer(
                    "Test",
                    "Guest",
                    "000",
                    "Synthetic",
                )
            )
        val first = apartments.save(Apartment(null, 2, "South", "Lake", 100, 150))
        val second = apartments.save(Apartment(null, 2, "East", "Garden", 100, 150))
        val path =
            "/api/v1/reservations?customerId=${guest.id}&roomId=${first.id}&startDate=2026-11-06&endDate=2026-11-09"
        val noKey = request("POST", path, operationKey = null)
        assertThat(noKey.statusCode()).isEqualTo(400)
        assertThat(noKey.body()).contains("HTTP_400")
        val invalidKey = request("POST", path, operationKey = "bad")
        assertThat(invalidKey.statusCode()).isEqualTo(400)
        assertThat(invalidKey.body()).contains("INVALID_OPERATION_KEY")
        val capacity = request("POST", "$path&guestCount=3")
        assertThat(capacity.statusCode()).isEqualTo(400)
        assertThat(capacity.body()).contains("CAPACITY_EXCEEDED")

        val key = java.util.UUID.randomUUID().toString()
        val created = request("POST", "$path&guestCount=2", operationKey = key)
        assertThat(created.statusCode()).isEqualTo(200)
        assertThat(created.headers().firstValue("X-Operation-Key")).hasValue(key)
        assertThat(created.headers().firstValue("X-Resource-Version")).hasValue("0")
        val id = created.body().toInt()
        assertThat(
                request("PATCH", "/api/v1/reservations?reservationId=$id&newRoomId=${second.id}")
                    .statusCode()
            )
            .isEqualTo(400)
        assertThat(
                request(
                        "PATCH",
                        "/api/v1/reservations?reservationId=$id&newRoomId=${second.id}&expectedVersion=0",
                    )
                    .statusCode()
            )
            .isEqualTo(200)
        val stale = request("DELETE", "/api/v1/reservations?reservationId=$id&expectedVersion=0")
        assertThat(stale.statusCode()).isEqualTo(409)
        assertThat(stale.body()).contains("STALE_VERSION")
        val replay = request("POST", "$path&guestCount=2", operationKey = key)
        assertThat(replay.body()).isEqualTo(created.body())
        assertThat(replay.headers().firstValue("X-Resource-Version")).hasValue("0")
        val outcome = request("GET", "/api/v1/operations/$key?kind=CREATE")
        assertThat(outcome.statusCode()).isEqualTo(200)
        assertThat(outcome.body()).contains("\"roomId\":${first.id}").contains("\"version\":0")
        assertThat(request("GET", "/api/v1/reservations/$id").body())
            .contains("\"roomId\":${second.id}")
            .contains("\"version\":1")
        val reused = request("POST", "$path&guestCount=1", operationKey = key)
        assertThat(reused.statusCode()).isEqualTo(409)
        assertThat(reused.body()).contains("IDEMPOTENCY_KEY_REUSED")
        val unknown = request("GET", "/api/v1/operations/$key?kind=MOVE")
        assertThat(unknown.statusCode()).isEqualTo(404)
        assertThat(unknown.body()).contains("OPERATION_NOT_COMMITTED")
        assertThat(reservations.count()).isEqualTo(1)
    }

    @Test
    fun maintenanceSharesBookingConflictsAndRequiresItsCurrentVersion() {
        val room = apartments.save(Apartment(null, 2, "South", "Lake", 100, 150))
        val path =
            "/api/v1/maintenance-blocks?roomId=${room.id}&startDate=2026-11-06&endDate=2026-11-09"
        val invalid = request("POST", "$path&reason=%20")
        assertThat(invalid.statusCode()).isEqualTo(400)
        assertThat(invalid.body()).contains("INVALID_REASON")
        val created = request("POST", path)
        assertThat(created.statusCode()).isEqualTo(200)
        val id =
            tools.jackson.databind.json.JsonMapper.builder()
                .build()
                .readTree(created.body())
                .get("id")
                .asInt()
        val conflict = request("POST", path)
        assertThat(conflict.statusCode()).isEqualTo(409)
        assertThat(conflict.body()).contains("INVENTORY_CONFLICT")
        assertThat(
                request("DELETE", "/api/v1/maintenance-blocks/$id?expectedVersion=1").statusCode()
            )
            .isEqualTo(409)
        val cancelled = request("DELETE", "/api/v1/maintenance-blocks/$id?expectedVersion=0")
        assertThat(cancelled.statusCode()).isEqualTo(200)
        assertThat(cancelled.body()).contains("CANCELLED").contains("\"version\":1")
        assertThat(request("POST", path).statusCode()).isEqualTo(200)
    }

    @Test
    fun calendarAndHistoryHttpQueriesValidateBoundsAndExposeCursors() {
        val json = tools.jackson.databind.json.JsonMapper.builder().build()
        val guest =
            customers.save(
                com.villarosa.repository.model.Customer.buildCustomer(
                    "Query",
                    "Guest",
                    "000",
                    "Synthetic",
                )
            )
        val room = apartments.save(Apartment(null, 2, "South", "Lake", 100, 150))
        val first =
            request(
                    "POST",
                    "/api/v1/reservations?customerId=${guest.id}&roomId=${room.id}&startDate=2026-11-01&endDate=2026-11-03",
                )
                .body()
                .toInt()
        val second =
            request(
                    "POST",
                    "/api/v1/reservations?customerId=${guest.id}&roomId=${room.id}&startDate=2026-11-03&endDate=2026-11-05",
                )
                .body()
                .toInt()
        assertThat(
                request("DELETE", "/api/v1/reservations?reservationId=$first&expectedVersion=0")
                    .statusCode()
            )
            .isEqualTo(200)
        val path = "/api/v1/reservations?startDate=2026-11-01&endDate=2026-11-06"
        val firstPage = request("GET", "$path&limit=1")
        assertThat(firstPage.statusCode()).isEqualTo(200)
        val page = json.readTree(firstPage.body())
        assertThat(page.get("items").size()).isEqualTo(1)
        assertThat(page.get("nextCursor").asInt()).isEqualTo(first)
        val next = json.readTree(request("GET", "$path&limit=1&afterId=$first").body())
        assertThat(next.get("items").get(0).get("id").asInt()).isEqualTo(second)
        assertThat(next.get("nextCursor").isNull).isTrue()
        val active = json.readTree(request("GET", "$path&status=ACTIVE").body())
        assertThat(active.get("items").size()).isEqualTo(1)
        assertThat(active.get("items").get(0).get("id").asInt()).isEqualTo(second)
        val history = request("GET", "/api/v1/reservations/$first/events?limit=1")
        assertThat(history.statusCode()).isEqualTo(200)
        val events = json.readTree(history.body())
        assertThat(events.get("nextCursor").isString).isTrue()
        assertThat(events.get("items").get(0).get("occurredAt").asString()).endsWith("Z")
        assertThat(history.body()).doesNotContain("phone", "address", "Guest")
        val badLimit = request("GET", "$path&limit=201")
        assertThat(badLimit.statusCode()).isEqualTo(400)
        assertThat(badLimit.body()).contains("INVALID_PAGE_SIZE")
        val badCursor = request("GET", "/api/v1/reservations/$first/events?afterId=1.5")
        assertThat(badCursor.statusCode()).isEqualTo(400)
        assertThat(badCursor.body()).contains("INVALID_CURSOR")
        assertThat(request("GET", "$path&status=active").statusCode()).isEqualTo(400)
        assertThat(request("GET", "/api/v1/reservations/999999/events").statusCode()).isEqualTo(404)
        val block =
            request(
                "POST",
                "/api/v1/maintenance-blocks?roomId=${room.id}&startDate=2026-12-01&endDate=2026-12-03",
            )
        val blockId = json.readTree(block.body()).get("id").asInt()
        val blocks =
            request(
                "GET",
                "/api/v1/maintenance-blocks?startDate=2026-12-01&endDate=2026-12-04&limit=1",
            )
        assertThat(blocks.statusCode()).isEqualTo(200)
        assertThat(json.readTree(blocks.body()).get("items").size()).isEqualTo(1)
        assertThat(request("GET", "/api/v1/maintenance-blocks/$blockId/events").statusCode())
            .isEqualTo(200)
    }

    private fun request(
        method: String,
        path: String,
        credentials: String? = "test:test",
        operationKey: String? = java.util.UUID.randomUUID().toString(),
    ): HttpResponse<String> {
        val request =
            HttpRequest.newBuilder(URI("http://127.0.0.1:$port$path"))
                .apply {
                    if (credentials != null)
                        header(
                            "Authorization",
                            "Basic ${Base64.getEncoder().encodeToString(credentials.toByteArray(StandardCharsets.UTF_8))}",
                        )
                }
                .apply {
                    if (method in listOf("POST", "PATCH", "DELETE") && operationKey != null)
                        header("Idempotency-Key", operationKey)
                }
                .method(method, HttpRequest.BodyPublishers.noBody())
                .build()
        return http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8))
    }

    companion object {
        private lateinit var bootstrapRows: Map<String, Long>

        @JvmStatic
        @BeforeAll
        fun captureUntouchedBootstrapRows() {
            DatabaseMigrations.migrate(database.jdbcUrl, database.username, database.password)
            DriverManager.getConnection(database.jdbcUrl, database.username, database.password)
                .use { connection ->
                    connection.createStatement().use { statement ->
                        bootstrapRows =
                            listOf(
                                    "apartments",
                                    "customers",
                                    "reservations",
                                    "maintenance_blocks",
                                    "inventory_operations",
                                    "inventory_events",
                                    "staff_accounts",
                                    "staff_invitations",
                                    "staff_events",
                                )
                                .associateWith { table ->
                                    statement.executeQuery("SELECT COUNT(*) FROM $table").use {
                                        result ->
                                        check(result.next())
                                        result.getLong(1)
                                    }
                                }
                    }
                }
        }

        @Container @JvmField val database = TestDatabases.mariaDb()

        @JvmStatic
        @DynamicPropertySource
        fun databaseProperties(properties: DynamicPropertyRegistry) {
            properties.add("spring.datasource.url", database::getJdbcUrl)
            properties.add("spring.datasource.username", database::getUsername)
            properties.add("spring.datasource.password", database::getPassword)
            properties.add("spring.datasource.driver-class-name", database::getDriverClassName)
            properties.add("spring.jpa.hibernate.ddl-auto") { "validate" }
        }
    }
}
