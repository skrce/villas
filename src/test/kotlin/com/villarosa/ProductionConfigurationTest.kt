package com.villarosa

import com.villarosa.repository.ApartmentRepository
import com.villarosa.repository.CustomerRepository
import com.villarosa.repository.ReservationRepository
import com.villarosa.security.AuthenticationSettings
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.HttpHeaders
import org.springframework.mock.env.MockEnvironment
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@SpringBootTest(
    properties =
        [
            "spring.datasource.url=jdbc:h2:mem:production-check;MODE=MySQL;DB_CLOSE_DELAY=-1",
            "spring.datasource.username=sa",
            "spring.datasource.password=",
            "spring.jpa.hibernate.ddl-auto=create-drop",
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
