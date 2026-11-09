package com.villarosa

import java.net.URI

object CloudSettings {
    fun validate(environment: Map<String, String>, privateSettings: Map<String, String>) {
        if (environment["VILLAS_CLOUD_RUN"] != "1") return
        require(environment.getOrDefault("VILLAS_MODE", "production") == "production") {
            "Cloud Run requires production mode."
        }
        require(environment.getOrDefault("VILLAS_AUTH_PROVIDER", "google") == "google") {
            "Cloud Run requires Google authentication."
        }
        val url = privateSettings["VILLAS_DB_URL"].orEmpty()
        val valid =
            try {
                val uri = URI(url.removePrefix("jdbc:"))
                val parameters = uri.rawQuery.orEmpty().split('&').map { it.split('=', limit = 2) }
                val values = parameters.filter { it.size == 2 }.associate { it[0] to it[1] }
                url.startsWith("jdbc:postgresql://") &&
                    uri.host?.matches(
                        Regex("ep-[a-z0-9-]+(?:\\.c-[0-9]+)?\\.eu-central-1\\.aws\\.neon\\.tech")
                    ) == true &&
                    !uri.host.contains("-pooler") &&
                    uri.rawUserInfo == null &&
                    uri.rawFragment == null &&
                    uri.port in setOf(-1, 5432) &&
                    uri.path == "/villarosa" &&
                    parameters.size == 2 &&
                    values.size == 2 &&
                    values["sslmode"] == "verify-full" &&
                    values["sslrootcert"] == "/etc/ssl/certs/ca-certificates.crt"
            } catch (_: Exception) {
                false
            }
        require(valid) { "Cloud Run requires a direct Frankfurt Neon database with verified TLS." }
    }
}
