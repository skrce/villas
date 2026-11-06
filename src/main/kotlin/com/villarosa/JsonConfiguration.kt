package com.villarosa

import org.springframework.boot.jackson.autoconfigure.JsonMapperBuilderCustomizer
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import tools.jackson.databind.DeserializationFeature
import tools.jackson.databind.MapperFeature

@Configuration(proxyBeanMethods = false)
class JsonConfiguration {
    @Bean
    fun strictJsonScalars() = JsonMapperBuilderCustomizer { builder ->
        builder.disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
        builder.disable(MapperFeature.ALLOW_COERCION_OF_SCALARS)
        builder.enable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
    }
}
