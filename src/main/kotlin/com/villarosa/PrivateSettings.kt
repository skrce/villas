package com.villarosa

import java.nio.file.Files
import java.nio.file.Path

object PrivateSettings {
    private val names =
        setOf(
            "VILLAS_DB_URL",
            "VILLAS_DB_USERNAME",
            "VILLAS_DB_PASSWORD",
            "VILLAS_GOOGLE_CLIENT_ID",
            "VILLAS_GOOGLE_CLIENT_SECRET",
            "VILLAS_INITIAL_OWNER_EMAIL",
            "VILLAS_NEW_BUSINESS_ID",
            "VILLAS_NEW_BUSINESS_NAME",
            "VILLAS_OWNER_BUSINESS_ID",
        )

    fun resolve(environment: Map<String, String> = System.getenv()): Map<String, String> =
        names
            .mapNotNull { name ->
                val direct = environment[name]?.takeIf { it.isNotBlank() }
                val file = environment["${name}_FILE"]?.takeIf { it.isNotBlank() }
                require(direct == null || file == null) { "Configure only one source for $name." }
                val value = if (file == null) direct else read(name, file)
                value?.let { name to it }
            }
            .toMap()

    fun install() {
        val settings = resolve()
        CloudSettings.validate(System.getenv(), settings)
        settings.forEach { (name, value) -> System.setProperty(name, value) }
    }

    private fun read(name: String, file: String): String {
        val value =
            try {
                val path = Path.of(file)
                require(path.isAbsolute && Files.isRegularFile(path))
                val bytes = Files.newInputStream(path).use { it.readNBytes(16_385) }
                require(bytes.size <= 16_384)
                bytes.toString(Charsets.UTF_8).trimEnd('\r', '\n')
            } catch (_: Exception) {
                error("Cannot read the configured private file for $name.")
            }
        require(value.isNotBlank() && value.none { it == '\u0000' || it == '\r' || it == '\n' }) {
            "The configured private file for $name must contain one nonempty line."
        }
        return value
    }
}
