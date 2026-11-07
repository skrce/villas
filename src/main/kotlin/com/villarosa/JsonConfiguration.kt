package com.villarosa

import org.springframework.boot.jackson.autoconfigure.JsonMapperBuilderCustomizer
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import tools.jackson.databind.DeserializationFeature
import tools.jackson.databind.MapperFeature
import tools.jackson.databind.cfg.CoercionAction
import tools.jackson.databind.cfg.CoercionInputShape
import tools.jackson.databind.cfg.EnumFeature
import tools.jackson.databind.type.LogicalType

@Configuration(proxyBeanMethods = false)
class JsonConfiguration {
    @Bean
    fun strictJsonScalars() = JsonMapperBuilderCustomizer { builder ->
        builder.disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
        builder.disable(MapperFeature.ALLOW_COERCION_OF_SCALARS)
        builder.enable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
        builder.enable(EnumFeature.FAIL_ON_NUMBERS_FOR_ENUMS)
        builder.withCoercionConfig(LogicalType.Textual) { config ->
            for (shape in
                listOf(
                    CoercionInputShape.Integer,
                    CoercionInputShape.Float,
                    CoercionInputShape.Boolean,
                )) config.setCoercion(shape, CoercionAction.Fail)
        }
    }
}
