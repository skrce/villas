package com.villarosa

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class CloudSettingsTest {
    private val environment = mapOf("VILLAS_CLOUD_RUN" to "1")
    private val url =
        "jdbc:postgresql://ep-synthetic-example.eu-central-1.aws.neon.tech/villarosa?sslmode=verify-full&sslrootcert=/etc/ssl/certs/ca-certificates.crt"

    @Test
    fun acceptsOnlyDirectFrankfurtConnectionsWithVerifiedTlsAndSeparateCredentials() {
        CloudSettings.validate(environment, mapOf("VILLAS_DB_URL" to url))
        for (bad in
            listOf(
                url.replace("eu-central-1", "us-east-1"),
                url.replace("ep-synthetic-example", "ep-synthetic-example-pooler"),
                url.replace("verify-full", "require"),
                url.replace("//ep-", "//user:password@ep-"),
                "$url&sslmode=disable",
                "$url&user=owner",
                "$url#private",
                url.replace("/villarosa?", "/other?"),
                url.replace("/etc/ssl/certs/ca-certificates.crt", "/tmp/untrusted.crt"),
            )) assertThrows<IllegalArgumentException> {
            CloudSettings.validate(environment, mapOf("VILLAS_DB_URL" to bad))
        }
    }

    @Test
    fun cloudCannotEnableLocalIdentityOrDevelopmentMode() {
        for (setting in listOf("VILLAS_MODE" to "local", "VILLAS_AUTH_PROVIDER" to "synthetic")) {
            assertThrows<IllegalArgumentException> {
                CloudSettings.validate(environment + setting, mapOf("VILLAS_DB_URL" to url))
            }
        }
        CloudSettings.validate(emptyMap(), emptyMap())
    }
}
