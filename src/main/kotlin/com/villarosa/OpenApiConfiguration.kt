package com.villarosa

import io.swagger.v3.oas.models.Components
import io.swagger.v3.oas.models.OpenAPI
import io.swagger.v3.oas.models.Paths
import io.swagger.v3.oas.models.info.Info
import io.swagger.v3.oas.models.security.SecurityRequirement
import io.swagger.v3.oas.models.security.SecurityScheme
import io.swagger.v3.oas.models.servers.Server
import org.springdoc.core.customizers.OpenApiCustomizer
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration(proxyBeanMethods = false)
class OpenApiConfiguration {
    @Bean
    fun apiDescription(): OpenAPI =
        OpenAPI()
            .info(
                Info()
                    .title("Villarosa API")
                    .version("1.0.0")
                    .description(
                        "Staff API. Basic Auth is available only for local development and tests."
                    )
            )
            .components(
                Components()
                    .addSecuritySchemes(
                        "basicAuth",
                        SecurityScheme()
                            .type(SecurityScheme.Type.HTTP)
                            .scheme("basic")
                            .description(
                                "Local/test compatibility only. Production access is disabled pending staff Google login."
                            ),
                    )
            )
            .addSecurityItem(SecurityRequirement().addList("basicAuth"))

    @Bean
    fun canonicalPaths(): OpenApiCustomizer = OpenApiCustomizer { api ->
        val paths = Paths()
        api.paths.orEmpty().toSortedMap().forEach { (path, operation) ->
            if (path.startsWith(API_PREFIX + "/")) {
                paths.addPathItem(path.removePrefix(API_PREFIX), operation)
            }
        }
        api.paths = paths
        api.servers = listOf(Server().url(API_PREFIX))
    }

    companion object {
        const val API_PREFIX = "/api/v1"
    }
}
