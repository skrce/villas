package com.villarosa

import com.villarosa.security.AuthenticationSettings
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.mock.env.MockEnvironment

class AuthenticationSettingsTest {
    private fun production() =
        MockEnvironment()
            .withProperty("villas.mode", "production")
            .withProperty("villas.public-url", "https://villas.example.test")
            .withProperty("villas.google.client-id", "123456-test.apps.googleusercontent.com")
            .withProperty("villas.google.client-secret", "private-fixture-secret")

    private fun synthetic() =
        production()
            .withProperty("villas.mode", "local")
            .withProperty("villas.public-url", "http://localhost:5173")
            .withProperty("villas.auth.provider", "synthetic")
            .withProperty("villas.auth.synthetic-issuer", "http://127.0.0.1:19108")

    @Test
    fun productionUsesOnlyGoogleWithSecureHostScopedCookieAndAnExactCallback() {
        val settings = AuthenticationSettings(production())
        assertThat(settings.cookieName).isEqualTo("__Host-villas")
        assertThat(settings.secureCookie).isTrue()
        assertThat(settings.issuer).isEqualTo("https://accounts.google.com")
        assertThat(settings.registration().redirectUri)
            .isEqualTo("https://villas.example.test/login/oauth2/code/google")
        assertThat(settings.registration().providerDetails.authorizationUri)
            .isEqualTo("https://accounts.google.com/o/oauth2/v2/auth")
    }

    @ParameterizedTest
    @ValueSource(strings = ["http://villas.example.test", "http://127.0.0.1:5173"])
    fun productionRejectsInsecureOrigins(origin: String) {
        assertThatThrownBy {
                AuthenticationSettings(production().withProperty("villas.public-url", origin))
            }
            .hasMessage("Production staff sessions require HTTPS.")
    }

    @ParameterizedTest
    @ValueSource(
        strings =
            [
                "https://user@villas.example.test",
                "https://villas.example.test/path",
                "https://villas.example.test?query=1",
                "https://villas.example.test#fragment",
                "not-an-origin",
            ]
    )
    fun originsCannotContainCredentialsPathsQueriesOrFragments(origin: String) {
        assertThatThrownBy {
                AuthenticationSettings(production().withProperty("villas.public-url", origin))
            }
            .isInstanceOf(IllegalArgumentException::class.java)
    }

    @ParameterizedTest
    @ValueSource(strings = ["test", "synthetic-secret", "changeme", "replace-me"])
    fun productionRejectsDemonstrationSecrets(secret: String) {
        assertThatThrownBy {
                AuthenticationSettings(
                    production().withProperty("villas.google.client-secret", secret)
                )
            }
            .hasMessage("Configure a Villas-specific Google web client for production.")
    }

    @Test
    fun productionRejectsUnknownModeProviderBlankClientAndSyntheticRemnants() {
        listOf(
                "villas.mode" to "staging-typo",
                "villas.auth.provider" to "password",
                "villas.google.client-id" to "",
                "villas.google.client-secret" to "",
                "villas.auth.synthetic-issuer" to "http://127.0.0.1:19108",
                "villas.google.client-id" to "villas-test",
            )
            .forEach { (key, value) ->
                assertThatThrownBy { AuthenticationSettings(production().withProperty(key, value)) }
                    .isInstanceOf(IllegalArgumentException::class.java)
            }
    }

    @ParameterizedTest
    @ValueSource(
        strings =
            [
                "https://remote.example.test",
                "http://localhost:19108/path",
                "http://user@localhost:19108",
                "http://localhost:19108?query=1",
                "http://localhost:19108#fragment",
            ]
    )
    fun syntheticIssuerMustBeAnExplicitLoopbackOrigin(origin: String) {
        assertThatThrownBy {
                AuthenticationSettings(
                    synthetic().withProperty("villas.auth.synthetic-issuer", origin)
                )
            }
            .hasMessage("Synthetic authentication must use an explicit loopback issuer.")
    }

    @Test
    fun syntheticConfigurationCannotBindPubliclyOrUseARemoteFrontend() {
        assertThatThrownBy {
                AuthenticationSettings(synthetic().withProperty("server.address", "0.0.0.0"))
            }
            .hasMessage("Synthetic authentication requires a loopback bind address.")
        assertThatThrownBy {
                AuthenticationSettings(
                    synthetic().withProperty("villas.public-url", "https://remote.example.test")
                )
            }
            .hasMessage("Local staff authentication requires a loopback public origin.")
        val settings = AuthenticationSettings(synthetic())
        assertThat(settings.cookieName).isEqualTo("VILLAS_LOCAL_SESSION")
        assertThat(settings.registration().providerDetails.jwkSetUri)
            .isEqualTo("http://127.0.0.1:19108/jwks")
        assertThat(
                AuthenticationSettings(
                        synthetic().withProperty("villas.public-url", "https://localhost:5173")
                    )
                    .secureCookie
            )
            .isTrue()
    }
}
