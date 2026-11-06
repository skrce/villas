package com.villarosa.controller

import java.nio.file.Files
import java.nio.file.Path
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@SpringBootTest
@ActiveProfiles("test")
@AutoConfigureMockMvc
class ApiContractTest @Autowired constructor(private val mvc: MockMvc) {
    @Test
    fun exportsTheCanonicalContractUsedByTheFrontend() {
        val result =
            mvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk)
                .andExpect(jsonPath("$.servers[0].url").value("/api/v1"))
                .andExpect(
                    jsonPath("$.paths['/apartments'].get.operationId").value("listApartments")
                )
                .andExpect(
                    jsonPath("$.paths['/customers/search'].post.operationId")
                        .value("searchCustomer")
                )
                .andExpect(
                    jsonPath("$.paths['/reservations'].post.operationId").value("createReservation")
                )
                .andExpect(
                    jsonPath("$.paths['/reservations'].delete.operationId")
                        .value("cancelReservation")
                )
                .andExpect(
                    jsonPath("$.paths['/reservations'].patch.operationId")
                        .value("updateReservationRoom")
                )
                .andExpect(jsonPath("$.paths['/reservation']").doesNotExist())
                .andExpect(jsonPath("$.paths['/api/v1/reservations']").doesNotExist())
                .andReturn()
        Files.createDirectories(Path.of("target"))
        Files.writeString(Path.of("target/openapi.json"), result.response.contentAsString)
    }
}
