package com.villarosa.service

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class PropertyScopeTest {
    @Test
    fun deploymentIdentifiersCannotChangeSqlOrAddressAnotherProperty() {
        assertThat(PropertyScope.identifier("garden-studio")).isEqualTo("garden-studio")
        for (value in listOf("", "Garden", "other/property", "a'b", "x".repeat(65))) {
            assertThrows<IllegalArgumentException> { PropertyScope.identifier(value) }
        }
    }

    @Test
    fun propertyNamesAllowUnicodeWithoutControls() {
        assertThat(PropertyScope.displayName("  Езерски апартмани  "))
            .isEqualTo("Езерски апартмани")
        for (value in listOf("", " ", "Name\nOther", "x".repeat(101))) {
            assertThrows<IllegalArgumentException> { PropertyScope.displayName(value) }
        }
    }
}
