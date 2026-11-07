package com.villarosa.service

import com.villarosa.exception.DomainException
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource

class OperationTimesTest {
    @Test
    fun exactUtcTimesAndLocalWallTimesRetainMicroseconds() {
        assertThat(OperationTimes.instant("2026-11-07T12:00:00.123456Z").nano).isEqualTo(123456000)
        assertThat(OperationTimes.local("2026-11-07T12:30").minute).isEqualTo(30)
        assertThat(OperationTimes.local("2026-11-07T12:30:01.123456").nano).isEqualTo(123456000)
    }

    @ParameterizedTest
    @ValueSource(
        strings =
            [
                "2026-11-07T12:00:00.1234567Z",
                "2026-11-07T12:00:60Z",
                "2026-02-30T12:00:00Z",
                "0999-12-31T12:00:00Z",
                "2026-11-07T12:00:00+01:00",
                "2026-11-07T12:00",
                " ",
            ]
    )
    fun invalidOrImpreciseUtcInputsAreNeverSilentlyNormalized(value: String) {
        assertThrows<DomainException> { OperationTimes.instant(value) }
    }

    @ParameterizedTest
    @ValueSource(
        strings =
            [
                "2026-02-30T12:00",
                "2026-11-07T24:00",
                "0999-12-31T12:00",
                "2026-11-07T12:00:00.1234567",
                "2026-11-07T12:00Z",
                "2026-11-7T12:00",
            ]
    )
    fun propertyWallTimesMustBeRealStrictSupportedLocalTimes(value: String) {
        assertThrows<DomainException> { OperationTimes.local(value) }
    }
}
