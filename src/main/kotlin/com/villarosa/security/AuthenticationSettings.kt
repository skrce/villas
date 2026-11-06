package com.villarosa.security

import java.net.URI
import java.time.Duration
import org.springframework.core.env.Environment
import org.springframework.security.config.oauth2.client.CommonOAuth2Provider
import org.springframework.security.oauth2.client.registration.ClientRegistration
import org.springframework.security.oauth2.core.AuthorizationGrantType
import org.springframework.security.oauth2.core.ClientAuthenticationMethod

class AuthenticationSettings(environment: Environment) {
    val mode = environment.getProperty("villas.mode", "production")
    val synthetic = environment.getProperty("villas.auth.provider", "google") == "synthetic"
    val publicOrigin = environment.getRequiredProperty("villas.public-url").trimEnd('/')
    val clientId = environment.getRequiredProperty("villas.google.client-id")
    private val secret = environment.getRequiredProperty("villas.google.client-secret")
    val issuer =
        if (synthetic) environment.getRequiredProperty("villas.auth.synthetic-issuer").trimEnd('/')
        else GOOGLE_ISSUER

    init {
        require(mode in setOf("production", "local", "test")) { "Invalid Villas runtime mode." }
        require(
            environment.getProperty("villas.auth.provider", "google") in
                setOf("google", "synthetic")
        ) {
            "Unsupported Villas identity provider."
        }
        require(clientId.isNotBlank() && secret.isNotBlank()) {
            "Villas Google client configuration is required."
        }
        val origin = URI(publicOrigin)
        require(
            origin.host != null &&
                origin.rawUserInfo == null &&
                origin.rawQuery == null &&
                origin.rawFragment == null &&
                origin.path.isNullOrEmpty()
        ) {
            "Villas public URL must be an origin without credentials, a path, query, or fragment."
        }
        if (mode == "production") {
            require(!synthetic && !environment.containsProperty("villas.auth.synthetic-issuer")) {
                "Synthetic authentication must not be configured in production."
            }
            require(
                !environment.containsProperty("villas.local-auth.username") &&
                    !environment.containsProperty("villas.local-auth.password")
            ) {
                "Development authentication must not be configured in production."
            }
            require(origin.scheme == "https") { "Production staff sessions require HTTPS." }
            require(
                clientId.matches(Regex("[0-9]+-[A-Za-z0-9_-]+\\.apps\\.googleusercontent\\.com")) &&
                    secret !in setOf("test", "synthetic-secret", "changeme") &&
                    !secret.startsWith("replace-")
            ) {
                "Configure a Villas-specific Google web client for production."
            }
        } else {
            require(origin.scheme in setOf("http", "https") && origin.host in LOOPBACK) {
                "Local staff authentication requires a loopback public origin."
            }
        }
        if (synthetic) {
            val provider = URI(issuer)
            require(
                mode != "production" &&
                    provider.scheme == "http" &&
                    provider.host in LOOPBACK &&
                    provider.path.isNullOrEmpty() &&
                    provider.rawQuery == null &&
                    provider.rawFragment == null &&
                    provider.rawUserInfo == null
            ) {
                "Synthetic authentication must use an explicit loopback issuer."
            }
            require(environment.getProperty("server.address", "127.0.0.1") in LOOPBACK) {
                "Synthetic authentication requires a loopback bind address."
            }
        }
    }

    fun registration(): ClientRegistration {
        val builder =
            if (synthetic)
                ClientRegistration.withRegistrationId("google")
                    .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                    .clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_BASIC)
                    .authorizationUri("$issuer/authorize")
                    .tokenUri("$issuer/token")
                    .jwkSetUri("$issuer/jwks")
                    .issuerUri(issuer)
                    .userNameAttributeName("sub")
            else CommonOAuth2Provider.GOOGLE.getBuilder("google")
        return builder
            .clientId(clientId)
            .clientSecret(secret)
            .scope("openid", "email", "profile")
            .redirectUri("$publicOrigin/login/oauth2/code/google")
            .clientName("Google")
            .build()
    }

    val secureCookie: Boolean
        get() = mode == "production" || URI(publicOrigin).scheme == "https"

    val cookieName: String
        get() = if (secureCookie) "__Host-villas" else "VILLAS_LOCAL_SESSION"

    companion object {
        const val GOOGLE_ISSUER = "https://accounts.google.com"
        val ABSOLUTE_LIMIT: Duration = Duration.ofDays(7)
        val IDLE_LIMIT: Duration = Duration.ofDays(3)
        val PREAUTH_LIMIT: Duration = Duration.ofMinutes(10)
        private val LOOPBACK = setOf("localhost", "127.0.0.1", "[::1]")
    }
}
