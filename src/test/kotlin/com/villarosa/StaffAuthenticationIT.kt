package com.villarosa

import com.villarosa.security.*
import java.net.CookieManager
import java.net.CookiePolicy
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.time.Instant
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.*
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import tools.jackson.databind.json.JsonMapper

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.DEFINED_PORT)
@ActiveProfiles("test")
@Testcontainers
@Import(StaffClockForTests::class)
class StaffAuthenticationIT
@Autowired
constructor(
    private val directory: StaffDirectory,
    private val jdbc: JdbcTemplate,
    private val staff: StaffRepository,
    private val clock: StaffTestClock,
) {
    private lateinit var cookies: CookieManager
    private lateinit var http: HttpClient
    private val json = JsonMapper.builder().build()

    private fun request(
        path: String,
        method: String = "GET",
        body: String? = null,
        csrf: String? = null,
        origin: String? = BASE,
    ): HttpResponse<String> {
        val builder = HttpRequest.newBuilder(URI(BASE + path)).timeout(Duration.ofSeconds(10))
        if (method != "GET" && origin != null) builder.header("Origin", origin)
        if (body != null) builder.header("Content-Type", "application/json")
        if (csrf != null) builder.header("X-CSRF-TOKEN", csrf)
        builder.method(
            method,
            if (body == null) HttpRequest.BodyPublishers.noBody()
            else HttpRequest.BodyPublishers.ofString(body),
        )
        return http.send(builder.build(), HttpResponse.BodyHandlers.ofString())
    }

    @BeforeEach
    fun reset() {
        TestData.reset(jdbc, database.jdbcUrl, authenticatedOwner = false)
        clock.time.set(Instant.now())
        directory.bootstrap("owner@example.test")
        provider.fault.set("")
        cookies = CookieManager(null, CookiePolicy.ACCEPT_ALL)
        http =
            HttpClient.newBuilder()
                .cookieHandler(cookies)
                .followRedirects(HttpClient.Redirect.NEVER)
                .build()
    }

    private fun signIn(identity: String = "owner"): Pair<String, HttpResponse<String>> {
        val start = request("/oauth2/authorization/google")
        assertThat(start.statusCode()).isEqualTo(302)
        val before = cookies.cookieStore.cookies.single { it.name == "VILLAS_LOCAL_SESSION" }.value
        val authorize = start.headers().firstValue("Location").get() + "&identity=$identity"
        val grant =
            http.send(
                HttpRequest.newBuilder(URI(authorize)).GET().build(),
                HttpResponse.BodyHandlers.ofString(),
            )
        assertThat(grant.statusCode()).isEqualTo(302)
        val callback = grant.headers().firstValue("Location").get()
        val completed =
            http.send(
                HttpRequest.newBuilder(URI(callback)).GET().build(),
                HttpResponse.BodyHandlers.ofString(),
            )
        return before to completed
    }

    private fun csrf(): String =
        json.readTree(request("/api/v1/auth/session").body()).get("csrfToken").asString()

    @Test
    fun validatedOidcCreatesAMinimalRotatedServerSessionAndCsrfProtectedWrites() {
        assertThat(request("/api/v1/apartments").statusCode()).isEqualTo(401)
        val (oldCookie, completed) = signIn()
        assertThat(completed.statusCode()).isEqualTo(302)
        assertThat(completed.headers().firstValue("Location").get())
            .isEqualTo("$BASE/auth/complete")
        val cookie = cookies.cookieStore.cookies.single { it.name == "VILLAS_LOCAL_SESSION" }
        assertThat(cookie.value).isNotEqualTo(oldCookie)
        val replay =
            HttpClient.newHttpClient()
                .send(
                    HttpRequest.newBuilder(URI("$BASE/api/v1/apartments"))
                        .header("Cookie", "VILLAS_LOCAL_SESSION=$oldCookie")
                        .GET()
                        .build(),
                    HttpResponse.BodyHandlers.ofString(),
                )
        assertThat(replay.statusCode()).isEqualTo(401)
        assertThat(cookie.isHttpOnly).isTrue()
        assertThat(completed.headers().allValues("Set-Cookie").joinToString())
            .contains("HttpOnly", "SameSite=Lax", "Path=/")
            .doesNotContain("Domain=")
        assertThat(request("/api/v1/apartments").statusCode()).isEqualTo(200)
        assertThat(
                request(
                        "/api/v1/customers",
                        "POST",
                        """{"firstName":"Test","lastName":"Guest","phone":"000","address":"Synthetic"}""",
                    )
                    .statusCode()
            )
            .isEqualTo(403)
        val saved =
            request(
                "/api/v1/customers",
                "POST",
                """{"firstName":"Test","lastName":"Guest","phone":"000","address":"Synthetic"}""",
                csrf(),
            )
        assertThat(saved.statusCode()).isEqualTo(200)
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM business_events", Long::class.java))
            .isEqualTo(1)
        val attributes =
            jdbc
                .query(
                    "SELECT ATTRIBUTE_BYTES FROM SPRING_SESSION_ATTRIBUTES",
                    { r, _ -> String(r.getBytes(1), Charsets.ISO_8859_1) },
                )
                .joinToString()
        assertThat(attributes)
            .doesNotContain(
                "OidcIdToken",
                "OAuth2AuthenticationToken",
                "synthetic-unused",
                "owner@example.test",
            )
        assertThat(attributes).contains("StaffAuthentication")
    }

    @ParameterizedTest
    @ValueSource(strings = ["uninvited", "unverified"])
    fun invitationAndVerifiedEmailAreRequiredRegardlessOfProviderRoleClaims(persona: String) {
        assertThat(signIn(persona).second.headers().firstValue("Location").get())
            .contains("sign_in_denied")
        assertThat(request("/api/v1/apartments").statusCode()).isEqualTo(401)
        assertThat(staff.count()).isZero()
    }

    @ParameterizedTest
    @ValueSource(strings = ["audience", "issuer", "expired", "nonce", "signature"])
    fun invalidSignedProviderResponsesCannotEstablishAStaffSession(fault: String) {
        provider.fault.set(fault)
        assertThat(signIn().second.headers().firstValue("Location").get())
            .contains("sign_in_denied")
        assertThat(staff.count()).isZero()
        assertThat(request("/api/v1/apartments").statusCode()).isEqualTo(401)
    }

    @Test
    fun parallelFirstSessionReadsShareTheLoginCsrfTokenWithoutAttributeInsertRaces() {
        signIn()
        val requests =
            (1..12).map {
                http.sendAsync(
                    HttpRequest.newBuilder(URI("$BASE/api/v1/auth/session")).GET().build(),
                    HttpResponse.BodyHandlers.ofString(),
                )
            }
        val replies = requests.map { it.get(10, java.util.concurrent.TimeUnit.SECONDS) }
        assertThat(replies.map { it.statusCode() }).containsOnly(200)
        for (reply in replies) {
            val token = json.readTree(reply.body()).get("csrfToken").asString()
            assertThat(
                    request("/api/v1/customers/search", "POST", """{"firstName":"Test"}""", token)
                        .statusCode()
                )
                .isEqualTo(200)
        }
    }

    @Test
    fun logoutRequiresCsrfAndRemovesTheServerSession() {
        signIn()
        assertThat(request("/api/v1/auth/logout", "POST").statusCode()).isEqualTo(403)
        assertThat(request("/api/v1/auth/logout", "POST", csrf = csrf()).statusCode())
            .isEqualTo(204)
        assertThat(request("/api/v1/apartments").statusCode()).isEqualTo(401)
        assertThat(
                json
                    .readTree(request("/api/v1/auth/session").body())
                    .get("authenticated")
                    .asBoolean()
            )
            .isFalse()
    }

    @Test
    fun revocationAndForeignOriginsCannotUseAnExistingCookie() {
        signIn()
        val token = csrf()
        val account = staff.findAll().single()
        assertThat(
                request(
                        "/api/v1/staff/invitations",
                        "POST",
                        """{"email":"new@example.test"}""",
                        token,
                        "https://wrong.invalid",
                    )
                    .statusCode()
            )
            .isEqualTo(403)
        directory.revokeSessions(account.identity(), account.id, account.version)
        assertThat(request("/api/v1/apartments").statusCode()).isEqualTo(401)
    }

    @Test
    fun anInvalidCallbackCannotBeUsedAsAGetLogoutRequest() {
        signIn()
        request("/login/oauth2/code/google?code=invalid&state=invalid")
        assertThat(request("/api/v1/apartments").statusCode()).isEqualTo(200)
    }

    @Test
    fun theSevenDayMaximumCannotBeExtendedByActivity() {
        signIn()
        repeat(3) {
            clock.time.set(clock.instant().plus(Duration.ofDays(2)))
            assertThat(request("/api/v1/apartments").statusCode()).isEqualTo(200)
        }
        clock.time.set(clock.instant().plus(Duration.ofDays(1)))
        val expired = request("/api/v1/apartments")
        assertThat(expired.statusCode()).isEqualTo(401)
        assertThat(expired.body()).contains("SESSION_EXPIRED")
    }

    @Test
    fun threeDaysWithoutActivityExpiresTheSessionAtTheBoundary() {
        signIn()
        clock.time.set(clock.instant().plus(Duration.ofDays(3)))
        assertThat(request("/api/v1/apartments").statusCode()).isEqualTo(401)
    }

    @Test
    fun anExpiredInvitationCannotBeAcceptedByAValidProviderLogin() {
        clock.time.set(clock.instant().plus(StaffDirectory.INVITATION_TTL))
        assertThat(signIn().second.headers().firstValue("Location").get())
            .contains("sign_in_denied")
        assertThat(staff.count()).isZero()
    }

    @Test
    fun staffAdministrationRejectsUnknownRoleInputAndCanInviteAnotherOwner() {
        signIn()
        val token = csrf()
        assertThat(
                request(
                        "/api/v1/staff/invitations",
                        "POST",
                        """{"email":"second-owner@example.test","role":"FRONT_DESK"}""",
                        token,
                    )
                    .statusCode()
            )
            .isEqualTo(400)
        assertThat(
                request(
                        "/api/v1/staff/invitations",
                        "POST",
                        """{"email":"second-owner@example.test"}""",
                        token,
                    )
                    .statusCode()
            )
            .isEqualTo(200)
        request("/api/v1/auth/logout", "POST", csrf = token)
        assertThat(signIn("second").second.headers().firstValue("Location").get())
            .isEqualTo("$BASE/auth/complete")
        assertThat(staff.count()).isEqualTo(2)
    }

    companion object {
        val PORT = TestOidcProvider.port()
        val BASE = "http://127.0.0.1:$PORT"
        val provider = TestOidcProvider("$BASE/login/oauth2/code/google")
        @Container @JvmField val database = TestDatabases.mariaDb()

        @JvmStatic
        @BeforeAll
        fun migrate() {
            DatabaseMigrations.migrate(database.jdbcUrl, database.username, database.password)
        }

        @JvmStatic
        @AfterAll
        fun stopProvider() {
            provider.close()
        }

        @JvmStatic
        @DynamicPropertySource
        fun properties(registry: DynamicPropertyRegistry) {
            registry.add("server.port") { PORT }
            registry.add("villas.public-url") { BASE }
            registry.add("villas.auth.synthetic-issuer") { provider.issuer }
            registry.add("spring.datasource.url", database::getJdbcUrl)
            registry.add("spring.datasource.username", database::getUsername)
            registry.add("spring.datasource.password", database::getPassword)
            registry.add("spring.datasource.driver-class-name", database::getDriverClassName)
            registry.add("spring.jpa.hibernate.ddl-auto") { "validate" }
            registry.add("spring.session.jdbc.initialize-schema") { "never" }
        }
    }
}
