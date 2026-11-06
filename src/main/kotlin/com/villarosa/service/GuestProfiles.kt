package com.villarosa.service

import com.villarosa.exception.invalid
import com.villarosa.repository.model.Customer
import io.swagger.v3.oas.annotations.media.Schema
import java.text.Normalizer
import java.util.Locale

data class GuestPage(
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val items: List<Customer>,
    val nextCursor: Int?,
)

data class GuestProfile(
    val firstName: String,
    val lastName: String,
    val phone: String?,
    val address: String?,
    val email: String?,
    val notes: String?,
) {
    companion object {
        fun normalize(
            first: String,
            last: String,
            phone: String?,
            address: String?,
            email: String?,
            notes: String?,
        ): GuestProfile {
            val normalizedEmail = optional(email, 254)?.lowercase(Locale.ROOT)
            if (
                normalizedEmail != null &&
                    !normalizedEmail.matches(Regex("[^\\s@]+@[^\\s@]+\\.[^\\s@]+"))
            )
                invalid("INVALID_GUEST", "Enter a valid email address.")
            return GuestProfile(
                name(first),
                name(last),
                phone(phone),
                optional(address, 500),
                normalizedEmail,
                optional(notes, 2000, multiline = true),
            )
        }

        fun name(value: String): String =
            optional(value, 200) ?: invalid("INVALID_GUEST", "First and last names are required.")

        fun optional(value: String?, maximum: Int, multiline: Boolean = false): String? {
            val text = Normalizer.normalize(value.orEmpty(), Normalizer.Form.NFC).trim()
            if (
                text.any { it.isISOControl() && !(multiline && it in "\n\r\t") } ||
                    text.length > maximum
            )
                invalid(
                    "INVALID_GUEST",
                    "Guest fields contain unsupported characters or exceed their allowed length.",
                )
            return text
                .takeIf { it.isNotEmpty() }
                ?.let { if (multiline) it else it.replace(Regex("[\\p{Z}\\s]+"), " ") }
        }

        fun phone(value: String?): String? {
            val text = optional(value, 200) ?: return null
            if (!text.matches(Regex("[+0-9(). -]+")))
                invalid(
                    "INVALID_PHONE",
                    "Use digits and an optional international prefix for phone numbers.",
                )
            val compact =
                text.replace(Regex("[(). -]"), "").let {
                    if (it.startsWith("00")) "+${it.drop(2)}" else it
                }
            if (!compact.matches(Regex("\\+?[0-9]{1,20}")))
                invalid("INVALID_PHONE", "Use 1 to 20 digits and an optional leading +.")
            return compact
        }
    }
}
