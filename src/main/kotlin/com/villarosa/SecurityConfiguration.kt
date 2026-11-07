package com.villarosa

import com.villarosa.security.*
import jakarta.servlet.DispatcherType
import java.time.Clock
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.env.Environment
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.oauth2.client.OAuth2AuthorizedClientService
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserService
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository
import org.springframework.security.oauth2.core.oidc.user.OidcUser
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.context.DelegatingSecurityContextRepository
import org.springframework.security.web.context.HttpSessionSecurityContextRepository
import org.springframework.security.web.context.RequestAttributeSecurityContextRepository
import org.springframework.security.web.context.SecurityContextHolderFilter
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository
import org.springframework.session.web.http.DefaultCookieSerializer

@Configuration(proxyBeanMethods = false)
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
class SecurityConfiguration {
    @Bean
    fun staffAuthenticationSettings(environment: Environment) = AuthenticationSettings(environment)

    @Bean
    fun clientRegistrations(settings: AuthenticationSettings) =
        InMemoryClientRegistrationRepository(settings.registration())

    @Bean
    fun staffSecurityContexts() =
        DelegatingSecurityContextRepository(
            RequestAttributeSecurityContextRepository(),
            object : HttpSessionSecurityContextRepository() {
                override fun saveContext(
                    context: org.springframework.security.core.context.SecurityContext,
                    request: jakarta.servlet.http.HttpServletRequest,
                    response: jakarta.servlet.http.HttpServletResponse,
                ) {
                    if (
                        context.authentication == null ||
                            context.authentication is StaffAuthentication
                    )
                        super.saveContext(context, request, response)
                }
            },
        )

    @Bean fun staffCsrfTokens() = HttpSessionCsrfTokenRepository()

    @Bean
    fun staffCookieSerializer(settings: AuthenticationSettings) =
        DefaultCookieSerializer().apply {
            setCookieName(settings.cookieName)
            setCookiePath("/")
            setUseHttpOnlyCookie(true)
            setUseSecureCookie(settings.secureCookie)
            setSameSite("Lax")
            setCookieMaxAge(AuthenticationSettings.ABSOLUTE_LIMIT.seconds.toInt())
        }

    @Bean
    fun staffSecurity(
        http: HttpSecurity,
        settings: AuthenticationSettings,
        access: StaffAccess,
        directory: StaffDirectory,
        clock: Clock,
        contexts: DelegatingSecurityContextRepository,
        csrf: HttpSessionCsrfTokenRepository,
        authorizedClients: OAuth2AuthorizedClientService,
        environment: Environment,
    ): SecurityFilterChain {
        val oidc = OidcUserService().apply { setRetrieveUserInfo { false } }
        http
            .httpBasic { it.disable() }
            .formLogin { it.disable() }
            .logout { it.disable() }
            .requestCache { it.disable() }
            .sessionManagement {
                it.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED).sessionFixation {
                    protection ->
                    protection.newSession()
                }
            }
            .securityContext { it.securityContextRepository(contexts).requireExplicitSave(true) }
            .csrf { it.csrfTokenRepository(csrf) }
            .exceptionHandling {
                it.authenticationEntryPoint { _, response, _ ->
                    response.status = 401
                    response.contentType = "application/json"
                    response.writer.write(
                        """{"code":"AUTHENTICATION_REQUIRED","message":"Sign in to continue."}"""
                    )
                }
                it.accessDeniedHandler { _, response, _ ->
                    response.status = 403
                    response.contentType = "application/json"
                    response.writer.write(
                        """{"code":"ACCESS_DENIED","message":"Access denied or session security token missing."}"""
                    )
                }
            }
            .authorizeHttpRequests {
                it.dispatcherTypeMatchers(DispatcherType.ERROR)
                    .permitAll()
                    .requestMatchers(ReleasePaths)
                    .permitAll()
                    .requestMatchers(
                        "/api/v1/auth/session",
                        "/oauth2/authorization/google",
                        "/login/oauth2/code/google",
                    )
                    .permitAll()
                if (settings.mode != "production")
                    it.requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html")
                        .permitAll()
                it.anyRequest().hasRole("OWNER")
            }
            .oauth2Login {
                it.loginPage("${settings.publicOrigin}/login")
                    .authorizationEndpoint { endpoint ->
                        endpoint.authorizationRequestRepository(StaffAuthorizationRequests(clock))
                    }
                    .userInfoEndpoint { endpoint -> endpoint.oidcUserService(oidc) }
                    .successHandler { request, response, authentication ->
                        val oauth = authentication as OAuth2AuthenticationToken
                        val user = oauth.principal as OidcUser
                        authorizedClients.removeAuthorizedClient(
                            oauth.authorizedClientRegistrationId,
                            oauth.name,
                        )
                        try {
                            val account =
                                directory.accept(
                                    VerifiedStaffIdentity(
                                        user.idToken.issuer.toString(),
                                        user.subject.orEmpty(),
                                        user.email ?: "",
                                        user.emailVerified == true,
                                    )
                                )
                            val context = SecurityContextHolder.createEmptyContext()
                            context.authentication = StaffAuthentication(account.identity())
                            SecurityContextHolder.setContext(context)
                            val session = request.getSession(true)
                            session.maxInactiveInterval =
                                AuthenticationSettings.IDLE_LIMIT.seconds.toInt()
                            session.setAttribute(
                                StaffSessionFilter.AUTHENTICATED_AT,
                                clock.millis(),
                            )
                            session.setAttribute(StaffSessionFilter.LAST_SEEN_AT, clock.millis())
                            session.setAttribute(
                                StaffSessionFilter.GENERATION,
                                java.util.UUID.randomUUID().toString(),
                            )
                            csrf.saveToken(csrf.generateToken(request), request, response)
                            contexts.saveContext(context, request, response)
                            response.sendRedirect("${settings.publicOrigin}/auth/complete")
                        } catch (_: Exception) {
                            com.villarosa.ops.RuntimeSignals.authFailure()
                            request.getSession(false)?.invalidate()
                            SecurityContextHolder.clearContext()
                            response.sendRedirect(
                                "${settings.publicOrigin}/login?error=sign_in_denied"
                            )
                        }
                    }
                    .failureHandler { request, response, _ ->
                        com.villarosa.ops.RuntimeSignals.authFailure()
                        val session = request.getSession(false)
                        val saved =
                            session?.getAttribute(
                                HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY
                            ) as? org.springframework.security.core.context.SecurityContext
                        if (saved?.authentication !is StaffAuthentication) session?.invalidate()
                        SecurityContextHolder.clearContext()
                        response.sendRedirect("${settings.publicOrigin}/login?error=sign_in_denied")
                    }
            }
            .addFilterAfter(
                StaffSessionFilter(settings, access, clock),
                SecurityContextHolderFilter::class.java,
            )
        if (environment.containsProperty("villas.web-root")) {
            http.headers { headers ->
                headers.contentSecurityPolicy {
                    it.policyDirectives(
                        "default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
                    )
                }
                headers.addHeaderWriter { _, response ->
                    response.setHeader("Referrer-Policy", "no-referrer")
                    response.setHeader(
                        "Permissions-Policy",
                        "camera=(), microphone=(), geolocation=()",
                    )
                }
            }
        }
        return http.build()
    }
}
