package com.villarosa.service

import com.villarosa.exception.DomainException
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class RoomProfilesTest {
    private val valid = RoomProfile("Studio", "R-1", 2, null, null, null, null, null)

    @Test
    fun invalidReferencesCapacitiesAndOversizedOrControlBearingFieldsAreRejected() {
        for (profile in
            listOf(
                valid.copy(name = " "),
                valid.copy(reference = "Has space"),
                valid.copy(reference = "-bad"),
                valid.copy(reference = "x".repeat(33)),
                valid.copy(capacity = 0),
                valid.copy(capacity = 1001),
                valid.copy(orientation = "x".repeat(201)),
                valid.copy(view = "x".repeat(201)),
                valid.copy(bedConfiguration = "x".repeat(201)),
                valid.copy(features = "x".repeat(1001)),
                valid.copy(floor = "x".repeat(51)),
                valid.copy(name = "Private\u0000value"),
            )) {
            assertThat(assertThrows<DomainException> { profile.normalized() }.message)
                .doesNotContain("Private")
        }
    }

    @Test
    fun metadataUsesComposedUnicodeAndOptionalBlanksStayMissing() {
        val profile =
            valid
                .copy(
                    name = " E\u0301va\u00a0\u202fstudio ",
                    reference = " room-1 ",
                    orientation = " ",
                )
                .normalized()
        assertThat(profile.name).isEqualTo("Éva studio")
        assertThat(profile.reference).isEqualTo("ROOM-1")
        assertThat(profile.orientation).isNull()
    }
}
