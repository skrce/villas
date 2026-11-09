package com.villarosa

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@SpringBootTest(
    properties =
        [
            "spring.datasource.url=jdbc:h2:mem:cloud-surface;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
            "spring.datasource.username=sa",
            "spring.datasource.password=",
            "spring.jpa.hibernate.ddl-auto=create-drop",
            "spring.session.jdbc.initialize-schema=always",
            "villas.mode=production",
            "villas.cloud-run=1",
            "villas.public-url=https://villas.example.test",
            "villas.google.client-id=123456-test.apps.googleusercontent.com",
            "villas.google.client-secret=private-production-fixture",
        ]
)
@AutoConfigureMockMvc
class CloudSurfaceTest @Autowired constructor(private val mvc: MockMvc) {
    companion object {
        @JvmStatic
        @org.springframework.test.context.DynamicPropertySource
        fun frontend(registry: org.springframework.test.context.DynamicPropertyRegistry) {
            registry.add("villas.web-root") {
                java.nio.file.Path.of("src/test/resources/release-web").toAbsolutePath().toString()
            }
        }
    }

    @Test
    fun directCloudIngressExposesOnlyDataFreeLivenessAndDeniesInternalEndpointsEvenForOwners() {
        mvc.perform(get("/health"))
            .andExpect(status().isOk)
            .andExpect(content().string("UP"))
            .andExpect(header().string("Strict-Transport-Security", "max-age=31536000"))
        for (path in
            listOf("/internal/health/ready", "/internal/health/live", "/internal/metrics")) {
            mvc.perform(get(path)).andExpect(status().isUnauthorized)
            mvc.perform(get(path).with(user("synthetic").roles("OWNER")))
                .andExpect(status().isForbidden)
        }
        mvc.perform(get("/api/v1/apartments")).andExpect(status().isUnauthorized)
    }
}
