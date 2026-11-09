package com.villarosa

import org.springframework.boot.webmvc.test.autoconfigure.MockMvcBuilderCustomizer
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get

@Configuration(proxyBeanMethods = false)
class TestBusinessRequests {
    @Bean
    fun businessRequestDefaults() = MockMvcBuilderCustomizer { builder ->
        builder.defaultRequest(get("/").header("X-Villas-Business", "villa-rosa"))
    }
}
