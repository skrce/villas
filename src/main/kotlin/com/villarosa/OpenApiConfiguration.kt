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
                        "Owner staff API. Google OIDC establishes a server-side session. Unsafe requests require the current CSRF header."
                    )
            )
            .components(
                Components()
                    .addSecuritySchemes(
                        "staffSession",
                        SecurityScheme()
                            .type(SecurityScheme.Type.APIKEY)
                            .`in`(SecurityScheme.In.COOKIE)
                            .name("__Host-villas")
                            .description(
                                "HttpOnly, host-scoped session cookie. Local HTTP uses VILLAS_LOCAL_SESSION. Browser requests use same-origin credentials; never read or copy this cookie in JavaScript."
                            ),
                    )
            )
            .addSecurityItem(SecurityRequirement().addList("staffSession"))

    @Bean
    fun canonicalPaths(): OpenApiCustomizer = OpenApiCustomizer { api ->
        val paths = Paths()
        api.paths.orEmpty().toSortedMap().forEach { (path, operation) ->
            if (path.startsWith(API_PREFIX + "/")) {
                paths.addPathItem(path.removePrefix(API_PREFIX), operation)
            }
        }
        api.components.addSecuritySchemes(
            "businessSelection",
            SecurityScheme()
                .type(SecurityScheme.Type.APIKEY)
                .`in`(SecurityScheme.In.HEADER)
                .name("X-Villas-Business")
                .description(
                    "Required explicit business ID for domain requests. This is a selector, not a credential. The server verifies current session membership and active business on every operation."
                ),
        )
        paths.forEach { (path, item) ->
            if (!path.startsWith("/auth/") && !path.startsWith("/businesses/")) {
                item.readOperations().forEach { operation ->
                    operation.security =
                        listOf(
                            SecurityRequirement()
                                .addList("staffSession")
                                .addList("businessSelection")
                        )
                }
            }
        }
        api.paths = paths
        api.servers = listOf(Server().url(API_PREFIX))
    }

    companion object {
        const val API_PREFIX = "/api/v1"
    }
}
