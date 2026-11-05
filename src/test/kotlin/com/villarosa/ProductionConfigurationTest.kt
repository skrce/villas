package com.villarosa

import com.villarosa.repository.ApartmentRepository
import com.villarosa.repository.CustomerRepository
import com.villarosa.repository.ReservationRepository
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.HttpHeaders
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
    fun productionDoesNotExposeBusinessDataBeforeGoogleLoginIsImplemented() {
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
        ApplicationContextRunner()
            .withUserConfiguration(SecurityConfiguration::class.java)
            .withPropertyValues(
                "villas.mode=production",
                "villas.local-auth.username=test",
                "villas.local-auth.password=test",
            )
            .run { context ->
                assertThat(context).hasFailed()
                assertThat(context.startupFailure)
                    .hasRootCauseMessage(
                        "Development authentication must not be configured in production."
                    )
            }
    }
}
