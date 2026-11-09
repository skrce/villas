package com.villarosa

import com.villarosa.repository.ApartmentRepository
import com.villarosa.repository.CustomerRepository
import com.villarosa.repository.ReservationRepository
import com.villarosa.security.AuthenticationSettings
import java.nio.file.Path
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.HttpHeaders
import org.springframework.mock.env.MockEnvironment
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@SpringBootTest(
    properties =
        [
            "spring.datasource.url=jdbc:h2:mem:production-check;MODE=MySQL;DB_CLOSE_DELAY=-1",
            "spring.datasource.username=sa",
            "spring.datasource.password=",
            "spring.jpa.hibernate.ddl-auto=create-drop",
            "spring.session.jdbc.initialize-schema=always",
            "villas.mode=production",
            "villas.public-url=https://villas.example.test",
            "villas.google.client-id=123456-test.apps.googleusercontent.com",
            "villas.google.client-secret=private-production-fixture",
        ]
)
@AutoConfigureMockMvc
class ProductionConfigurationTest
@Autowired
constructor(
    private val mvc: MockMvc,
    private val apartments: ApartmentRepository,
    private val customers: CustomerRepository,
    private val reservations: ReservationRepository,
) {
    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun frontend(registry: DynamicPropertyRegistry) {
            registry.add("villas.web-root") {
                Path.of("src/test/resources/release-web").toAbsolutePath().toString()
            }
        }
    }

    @Test
    fun publicFrontendRoutesServeOnlyTheShellAndKnownAssetsWithSecurityHeaders() {
        (ReleasePaths.pages.toList() +
                listOf("/reservations/123", "/guests/123", "/rooms/123") +
                (ReleasePaths.pages.filterNot { it.startsWith("/auth/") } +
                        listOf("/reservations/123", "/guests/123", "/rooms/123"))
                    .map { "/businesses/synthetic-lake$it" } +
                listOf("/businesses/synthetic-lake"))
            .forEach { path ->
                mvc.perform(get(path).accept("text/html"))
                    .andExpect(status().isOk)
                    .andExpect(
                        content().string("<!doctype html><title>Villas release fixture</title>\n")
                    )
                    .andExpect(header().string("Cache-Control", "no-store"))
                    .andExpect(header().string("Referrer-Policy", "no-referrer"))
                    .andExpect(header().exists("Content-Security-Policy"))
            }
        mvc.perform(get("/assets/index-fixture.js"))
            .andExpect(status().isOk)
            .andExpect(content().string("export {};\n"))
        mvc.perform(get("/assets/missing.js")).andExpect(status().isNotFound)
        mvc.perform(get("/assets/library.esm-fixture.js"))
            .andExpect(status().isOk)
            .andExpect(content().string("export {};\n"))
        listOf(
                "/api/v1/missing",
                "/internal/config",
                "/.env",
                "/assets/private.json",
                "/reservation/customer",
                "/v3/api-docs",
                "/businesses/synthetic-lake/api/v1/apartments",
                "/businesses/synthetic-lake/internal/metrics",
                "/businesses/synthetic-lake/assets/private.json",
                "/businesses/synthetic-lake/auth/start",
                "/businesses/INVALID/today",
            )
            .forEach { path ->
                mvc.perform(get(path).accept("text/html")).andExpect(status().isUnauthorized)
            }
    }

    @Test
    fun healthDisclosesOnlyStatusAndReadinessRequiresTheVersionedSchema() {
        mvc.perform(get("/internal/health/live"))
            .andExpect(status().isOk)
            .andExpect(content().string("UP"))
        mvc.perform(get("/internal/health/ready"))
            .andExpect(status().isServiceUnavailable)
            .andExpect(content().string("UNAVAILABLE"))
    }

    @Test
    fun spoofedForwardingHeadersCannotChangeTheGoogleCallbackOrSecureCookie() {
        mvc.perform(
                get("/oauth2/authorization/google")
                    .header("Forwarded", "proto=http;host=attacker.example")
                    .header("X-Forwarded-Host", "attacker.example")
                    .header("X-Forwarded-Proto", "http")
            )
            .andExpect(status().isFound)
            .andExpect(
                header()
                    .string(
                        "Location",
                        org.hamcrest.Matchers.containsString(
                            "redirect_uri=https://villas.example.test/login/oauth2/code/google"
                        ),
                    )
            )
    }

    @Test
    fun productionRejectsUnauthenticatedAndBasicRequests() {
        mvc.perform(get("/api/v1/apartments")).andExpect(status().isUnauthorized)
        mvc.perform(
                get("/api/v1/apartments").header(HttpHeaders.AUTHORIZATION, "Basic dGVzdDp0ZXN0")
            )
            .andExpect(status().isUnauthorized)
    }

    @Test
    fun productionDoesNotLoadDemonstrationRecords() {
        assertThat(apartments.count()).isZero()
        assertThat(customers.count()).isZero()
        assertThat(reservations.count()).isZero()
    }

    @Test
    fun productionRejectsDevelopmentCredentials() {
        val environment =
            MockEnvironment()
                .withProperty("villas.mode", "production")
                .withProperty("villas.public-url", "https://villas.example.test")
                .withProperty("villas.google.client-id", "123456-test.apps.googleusercontent.com")
                .withProperty("villas.google.client-secret", "private-production-fixture")
                .withProperty("villas.local-auth.password", "test")
        assertThatThrownBy { AuthenticationSettings(environment) }
            .hasMessage("Development authentication must not be configured in production.")
        environment.setProperty("villas.auth.provider", "synthetic")
        environment.setProperty("villas.auth.synthetic-issuer", "http://127.0.0.1:19099")
        assertThatThrownBy { AuthenticationSettings(environment) }
            .hasMessage("Synthetic authentication must not be configured in production.")
    }
}
