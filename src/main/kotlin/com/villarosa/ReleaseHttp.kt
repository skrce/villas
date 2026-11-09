package com.villarosa

import io.swagger.v3.oas.annotations.Hidden
import jakarta.servlet.http.HttpServletRequest
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.file.Files
import java.nio.file.Path
import java.time.Duration
import javax.sql.DataSource
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.core.env.Environment
import org.springframework.core.io.FileSystemResource
import org.springframework.core.io.support.PathMatchingResourcePatternResolver
import org.springframework.http.MediaType
import org.springframework.http.MediaTypeFactory
import org.springframework.http.ResponseEntity
import org.springframework.security.web.util.matcher.RequestMatcher
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

object ReleasePaths : RequestMatcher {
    val pages =
        arrayOf(
            "/",
            "/login",
            "/today",
            "/calendar",
            "/front-desk",
            "/housekeeping",
            "/reports",
            "/reservations",
            "/reservations/new",
            "/guests",
            "/rooms",
            "/settings/staff",
            "/auth/start",
            "/auth/complete",
        )
    private val detail = Regex("/(reservations|guests|rooms)/[0-9]+")
    private val businessPage = Regex("/businesses/[a-z0-9][a-z0-9-]{0,63}((?:/.*)?)")
    private val asset = Regex("/assets/[A-Za-z0-9_.-]+\\.(js|css|svg|png|webp|woff2?)")
    val health =
        setOf("/health", "/internal/health/live", "/internal/health/ready", "/internal/metrics")

    override fun matches(request: HttpServletRequest): Boolean {
        if (request.method != "GET") return false
        val path = request.requestURI.removePrefix(request.contextPath)
        val businessPath = businessPage.matchEntire(path)?.groupValues?.get(1)
        val scopedPage =
            businessPath != null &&
                (businessPath.isEmpty() ||
                    businessPath == "/" ||
                    businessPath in pages.filterNot { it.startsWith("/auth/") } ||
                    detail.matches(businessPath))
        return path in pages ||
            detail.matches(path) ||
            scopedPage ||
            asset.matches(path) ||
            path in health
    }
}

@Hidden
@RestController
@ConditionalOnProperty(name = ["villas.web-root"])
class FrontendFiles(environment: Environment) {
    private val root = Path.of(environment.getRequiredProperty("villas.web-root")).normalize()

    init {
        require(root.isAbsolute && Files.isRegularFile(root.resolve("index.html"))) {
            "Configure an absolute Villas frontend directory containing index.html."
        }
    }

    @GetMapping(
        "/",
        "/login",
        "/today",
        "/calendar",
        "/front-desk",
        "/housekeeping",
        "/reports",
        "/reservations",
        "/reservations/new",
        "/guests",
        "/rooms",
        "/settings/staff",
        "/auth/start",
        "/auth/complete",
        "/reservations/{id:[0-9]+}",
        "/guests/{id:[0-9]+}",
        "/rooms/{id:[0-9]+}",
        "/businesses/{businessId:[a-z0-9][a-z0-9-]{0,63}}",
        "/businesses/{businessId:[a-z0-9][a-z0-9-]{0,63}}/",
        "/businesses/{businessId:[a-z0-9][a-z0-9-]{0,63}}/login",
        "/businesses/{businessId:[a-z0-9][a-z0-9-]{0,63}}/today",
        "/businesses/{businessId:[a-z0-9][a-z0-9-]{0,63}}/calendar",
        "/businesses/{businessId:[a-z0-9][a-z0-9-]{0,63}}/front-desk",
        "/businesses/{businessId:[a-z0-9][a-z0-9-]{0,63}}/housekeeping",
        "/businesses/{businessId:[a-z0-9][a-z0-9-]{0,63}}/reports",
        "/businesses/{businessId:[a-z0-9][a-z0-9-]{0,63}}/reservations",
        "/businesses/{businessId:[a-z0-9][a-z0-9-]{0,63}}/reservations/new",
        "/businesses/{businessId:[a-z0-9][a-z0-9-]{0,63}}/guests",
        "/businesses/{businessId:[a-z0-9][a-z0-9-]{0,63}}/rooms",
        "/businesses/{businessId:[a-z0-9][a-z0-9-]{0,63}}/settings/staff",
        "/businesses/{businessId:[a-z0-9][a-z0-9-]{0,63}}/reservations/{id:[0-9]+}",
        "/businesses/{businessId:[a-z0-9][a-z0-9-]{0,63}}/guests/{id:[0-9]+}",
        "/businesses/{businessId:[a-z0-9][a-z0-9-]{0,63}}/rooms/{id:[0-9]+}",
        produces = [MediaType.TEXT_HTML_VALUE],
    )
    fun index(): ResponseEntity<FileSystemResource> =
        ResponseEntity.ok()
            .contentType(MediaType.TEXT_HTML)
            .body(FileSystemResource(root.resolve("index.html")))

    @GetMapping("/assets/{file:[A-Za-z0-9_.-]+\\.(?:js|css|svg|png|webp|woff2?)}")
    fun asset(request: HttpServletRequest): ResponseEntity<FileSystemResource> {
        val path =
            root.resolve(request.requestURI.removePrefix(request.contextPath).removePrefix("/"))
        if (!Files.isRegularFile(path)) return ResponseEntity.notFound().build()
        val resource = FileSystemResource(path)
        return ResponseEntity.ok()
            .contentType(
                MediaTypeFactory.getMediaType(resource).orElse(MediaType.APPLICATION_OCTET_STREAM)
            )
            .body(resource)
    }
}

@Hidden
@RestController
class ReleaseHealth(private val dataSource: DataSource) {
    private val versions =
        PathMatchingResourcePatternResolver()
            .getResources("classpath*:db/postgresql/V*__*.sql")
            .map { checkNotNull(it.filename).substringAfter("V").substringBefore("__").toInt() }
            .sorted()

    @GetMapping("/health", "/internal/health/live", produces = [MediaType.TEXT_PLAIN_VALUE])
    fun live() = "UP"

    @GetMapping("/internal/health/ready", produces = [MediaType.TEXT_PLAIN_VALUE])
    fun ready(): ResponseEntity<String> {
        val ready =
            try {
                dataSource.connection.use { connection ->
                    connection.createStatement().use { statement ->
                        statement.queryTimeout = 2
                        statement
                            .executeQuery(
                                "SELECT version, success FROM flyway_schema_history WHERE type='SQL' ORDER BY installed_rank"
                            )
                            .use { rows ->
                                val actual = mutableListOf<Int>()
                                var success = true
                                while (rows.next()) {
                                    actual.add(rows.getString(1).toInt())
                                    success = success && rows.getBoolean(2)
                                }
                                success && actual == versions && versions.isNotEmpty()
                            }
                    }
                }
            } catch (_: Exception) {
                false
            }
        if (!ready) com.villarosa.ops.RuntimeSignals.databaseFailure()
        return ResponseEntity.status(if (ready) 200 else 503)
            .body(if (ready) "UP" else "UNAVAILABLE")
    }
}

object HealthProbe {
    fun check(): Int =
        try {
            val port = System.getenv("VILLAS_PORT")?.toInt() ?: 9098
            val request =
                HttpRequest.newBuilder(URI("http://127.0.0.1:$port/internal/health/ready"))
                    .timeout(Duration.ofSeconds(4))
                    .GET()
                    .build()
            val response =
                HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(2))
                    .build()
                    .send(request, HttpResponse.BodyHandlers.discarding())
            if (response.statusCode() == 200) 0 else 1
        } catch (_: Exception) {
            1
        }
}
