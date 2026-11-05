package com.villarosa

import jakarta.servlet.http.HttpServletResponse
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.env.Environment
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.core.userdetails.User
import org.springframework.security.core.userdetails.UserDetailsService
import org.springframework.security.core.userdetails.UsernameNotFoundException
import org.springframework.security.provisioning.InMemoryUserDetailsManager
import org.springframework.security.web.AuthenticationEntryPoint
import org.springframework.security.web.SecurityFilterChain

@Configuration(proxyBeanMethods = false)
class SecurityConfiguration {
    @Bean
    fun staffUsers(environment: Environment): UserDetailsService {
        val mode = environment.getProperty("villas.mode", "production")
        require(mode in setOf("local", "test", "production")) { "Invalid Villas runtime mode." }
        if (mode == "production") {
            require(
                !environment.containsProperty("villas.local-auth.username") &&
                    !environment.containsProperty("villas.local-auth.password")
            ) {
                "Development authentication must not be configured in production."
            }
            return UserDetailsService {
                throw UsernameNotFoundException("Staff login is not configured.")
            }
        }
        val username = environment.getRequiredProperty("villas.local-auth.username")
        val password = environment.getRequiredProperty("villas.local-auth.password")
        require(username.isNotBlank() && password.isNotBlank()) {
            "Development credentials are required."
        }
        return InMemoryUserDetailsManager(
            User.withUsername(username).password("{noop}$password").roles("USER").build()
        )
    }

    @Bean
    @ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
    fun staffSecurity(http: HttpSecurity, environment: Environment): SecurityFilterChain {
        val development = environment.getProperty("villas.mode", "production") != "production"
        val authenticationRequired = AuthenticationEntryPoint { _, response, _ ->
            response.status = HttpServletResponse.SC_UNAUTHORIZED
            response.contentType = "application/json"
            response.writer.write(
                """{"code":"AUTHENTICATION_REQUIRED","message":"Authentication required."}"""
            )
        }
        http
            .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }
            .exceptionHandling {
                it.authenticationEntryPoint(authenticationRequired)
                it.accessDeniedHandler { _, response, _ ->
                    response.status = HttpServletResponse.SC_FORBIDDEN
                    response.contentType = "application/json"
                    response.writer.write("""{"code":"ACCESS_DENIED","message":"Access denied."}""")
                }
            }
        if (development) {
            // The legacy console uses Basic Auth only in explicit local/test modes.
            http
                .csrf { it.disable() }
                .authorizeHttpRequests {
                    it.requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html")
                        .permitAll()
                        .anyRequest()
                        .authenticated()
                }
                .httpBasic { it.authenticationEntryPoint(authenticationRequired) }
        } else {
            http.authorizeHttpRequests { it.anyRequest().denyAll() }
        }
        return http.build()
    }
}
