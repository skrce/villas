package com.villarosa

import java.nio.file.Files
import java.nio.file.Path
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir

class PrivateSettingsTest {
    @TempDir lateinit var directory: Path

    @Test
    fun directAndMountedSettingsResolveWithoutIncludingOtherEnvironmentValues() {
        val file = directory.resolve("secret")
        Files.writeString(file, "private-fixture\n")
        assertThat(
                PrivateSettings.resolve(
                    mapOf(
                        "VILLAS_DB_USERNAME" to "villas_runtime",
                        "VILLAS_DB_PASSWORD_FILE" to file.toString(),
                        "UNRELATED_TOKEN" to "must-not-copy",
                    )
                )
            )
            .containsExactlyInAnyOrderEntriesOf(
                mapOf(
                    "VILLAS_DB_USERNAME" to "villas_runtime",
                    "VILLAS_DB_PASSWORD" to "private-fixture",
                )
            )
    }

    @Test
    fun duplicateSourcesFailWithoutExposingValues() {
        assertThatThrownBy {
                PrivateSettings.resolve(
                    mapOf(
                        "VILLAS_DB_PASSWORD" to "sensitive",
                        "VILLAS_DB_PASSWORD_FILE" to "/private/secret",
                    )
                )
            }
            .hasMessage("Configure only one source for VILLAS_DB_PASSWORD.")
    }

    @Test
    fun missingRelativeDirectoryAndOversizedFilesFailWithoutPathsOrContents() {
        val large = directory.resolve("large")
        Files.writeString(large, "x".repeat(16_385))
        listOf(
                "relative",
                directory.toString(),
                directory.resolve("missing").toString(),
                large.toString(),
            )
            .forEach { path ->
                assertThatThrownBy {
                        PrivateSettings.resolve(mapOf("VILLAS_GOOGLE_CLIENT_SECRET_FILE" to path))
                    }
                    .hasMessage(
                        "Cannot read the configured private file for VILLAS_GOOGLE_CLIENT_SECRET."
                    )
            }
    }

    @Test
    fun blankMultilineAndNulFilesFailWithoutContents() {
        val file = directory.resolve("secret")
        listOf("\n", "secret\nsecond", "secret\u0000value").forEach { value ->
            Files.writeString(file, value)
            assertThatThrownBy {
                    PrivateSettings.resolve(
                        mapOf("VILLAS_INITIAL_OWNER_EMAIL_FILE" to file.toString())
                    )
                }
                .hasMessage(
                    "The configured private file for VILLAS_INITIAL_OWNER_EMAIL must contain one nonempty line."
                )
        }
    }
}
