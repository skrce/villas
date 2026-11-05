package com.villarosa

import com.github.dockerjava.api.model.ExposedPort
import com.github.dockerjava.api.model.PortBinding
import com.github.dockerjava.api.model.Ports
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
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.mariadb.MariaDBContainer
import org.testcontainers.utility.DockerImageName

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Testcontainers
class MariaDbIT
@Autowired
constructor(
    private val apartments: ApartmentRepository,
    private val customers: CustomerRepository,
    private val reservations: ReservationRepository,
    @LocalServerPort private val port: Int,
) {
    private val http = HttpClient.newHttpClient()

    @BeforeEach
    fun clearPrivateContainerFixtures() {
        reservations.deleteAllInBatch()
        customers.deleteAllInBatch()
        apartments.deleteAllInBatch()
    }

    @Test
    fun schemaStartsWithoutBusinessRecords() {
        assertThat(bootstrapRows)
            .containsExactlyInAnyOrderEntriesOf(
                mapOf("apartments" to 0L, "customers" to 0L, "reservations" to 0L)
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
            request("PATCH", "/api/v1/reservations?reservationId=$id&newRoomId=${second.id}")
        assertThat(moved.statusCode()).isEqualTo(200)
        assertThat(reservations.findById(id).get().roomId).isEqualTo(second.id)
        assertThat(request("DELETE", "/api/v1/reservations?reservationId=$id").statusCode())
            .isEqualTo(200)
        assertThat(reservations.findById(id)).isEmpty
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

    private fun request(
        method: String,
        path: String,
        credentials: String? = "test:test",
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
                .method(method, HttpRequest.BodyPublishers.noBody())
                .build()
        return http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8))
    }

    companion object {
        private lateinit var bootstrapRows: Map<String, Long>

        @JvmStatic
        @BeforeAll
        fun captureUntouchedBootstrapRows() {
            DriverManager.getConnection(database.jdbcUrl, database.username, database.password)
                .use { connection ->
                    connection.createStatement().use { statement ->
                        bootstrapRows =
                            listOf("apartments", "customers", "reservations").associateWith { table
                                ->
                                statement.executeQuery("SELECT COUNT(*) FROM $table").use { result
                                    ->
                                    check(result.next())
                                    result.getLong(1)
                                }
                            }
                    }
                }
        }

        @Container
        @JvmField
        val database =
            MariaDBContainer(
                    DockerImageName.parse(
                            checkNotNull(MariaDbIT::class.java.getResource("/mariadb-image.txt"))
                                .readText()
                                .trim()
                        )
                        .asCompatibleSubstituteFor("mariadb")
                )
                .withDatabaseName("villarosa")
                .withUsername("villas_test")
                .withPassword("synthetic-test-password")
                .withInitScript("db/schema.sql")
                .withCreateContainerCmdModifier { command ->
                    command.hostConfig?.withPortBindings(
                        PortBinding(Ports.Binding.bindIp("127.0.0.1"), ExposedPort(3306))
                    )
                }

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
