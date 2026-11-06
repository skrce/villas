package com.villarosa.service

import com.villarosa.exception.invalid
import com.villarosa.repository.model.Apartment
import io.swagger.v3.oas.annotations.media.Schema
import java.util.Locale

data class RoomProfile(
    val name: String,
    val reference: String,
    val capacity: Int,
    val orientation: String?,
    val view: String?,
    val bedConfiguration: String?,
    val features: String?,
    val floor: String?,
) {
    fun normalized(): RoomProfile {
        val normalizedName = text(name, 200) ?: invalid("INVALID_ROOM", "A room name is required.")
        val normalizedReference = reference.trim().uppercase(Locale.ROOT)
        if (!normalizedReference.matches(Regex("[A-Z0-9][A-Z0-9-]{0,31}")))
            invalid(
                "INVALID_ROOM_REFERENCE",
                "Use 1 to 32 letters, digits or hyphens for the room reference.",
            )
        if (capacity !in 1..1000)
            invalid("INVALID_CAPACITY", "Room capacity must be between 1 and 1000.")
        return RoomProfile(
            normalizedName,
            normalizedReference,
            capacity,
            text(orientation, 200),
            text(view, 200),
            text(bedConfiguration, 200),
            text(features, 1000),
            text(floor, 50),
        )
    }

    companion object {
        fun text(value: String?, maximum: Int): String? {
            val normalized =
                java.text.Normalizer.normalize(value.orEmpty(), java.text.Normalizer.Form.NFC)
                    .trim()
            if (normalized.length > maximum || normalized.any { it.isISOControl() })
                invalid(
                    "INVALID_ROOM",
                    "Room fields contain unsupported characters or exceed their allowed length.",
                )
            return normalized.takeIf { it.isNotEmpty() }?.replace(Regex("[\\p{Z}\\s]+"), " ")
        }
    }
}

data class RoomPage(
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val items: List<Apartment>,
    val nextCursor: Int?,
)
