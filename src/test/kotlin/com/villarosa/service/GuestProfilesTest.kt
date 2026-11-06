package com.villarosa.service

import com.villarosa.exception.DomainException
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class GuestProfilesTest {
    @Test
    fun namesNormalizeComposedUnicodeAndWhitespaceWhileMissingContactsStayNull() {
        val value =
            GuestProfile.normalize(" E\u0301va\u00a0\u202fMaria ", "  Гостин ", " ", null, "", "\n")
        assertThat(value.firstName).isEqualTo("Éva Maria")
        assertThat(value.lastName).isEqualTo("Гостин")
        assertThat(listOf(value.phone, value.address, value.email, value.notes)).containsOnlyNulls()
    }

    @Test
    fun invalidNamesContactsAndControlCharactersAreRejectedWithoutEchoingValues() {
        val cases =
            listOf(
                listOf("", "Guest", null, null, null, null),
                listOf("Name", " ", null, null, null, null),
                listOf("x".repeat(201), "Guest", null, null, null, null),
                listOf("Name", "Guest", null, "x".repeat(501), null, null),
                listOf("Name", "Guest", null, null, "x".repeat(255), null),
                listOf("Name", "Guest", null, null, "invalid private email", null),
                listOf("Name", "Guest", null, null, null, "x".repeat(2001)),
                listOf("Private\u0000value", "Guest", null, null, null, null),
                listOf("Name", "Guest", null, "Private\naddress", null, null),
                listOf("Name", "Guest", null, null, null, "Private\u0000note"),
            )
        cases.forEach { values ->
            val failure =
                assertThrows<DomainException> {
                    GuestProfile.normalize(
                        values[0]!!,
                        values[1]!!,
                        values[2],
                        values[3],
                        values[4],
                        values[5],
                    )
                }
            assertThat(failure.code).isEqualTo("INVALID_GUEST")
            assertThat(failure.message).doesNotContain("Private", "invalid private email")
        }
    }
}
