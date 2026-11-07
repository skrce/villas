package com.villarosa.service

import com.villarosa.exception.DomainException
import com.villarosa.repository.model.PaymentMethod
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource

class LedgerInputTest {
    @Test
    fun receiptReferencesAreOptionalTrimmedAndBoundedWithoutControls() {
        assertThat(LedgerInput.reference(null)).isNull()
        assertThat(LedgerInput.reference("   ")).isNull()
        assertThat(LedgerInput.reference("  Synthetic receipt  ")).isEqualTo("Synthetic receipt")
        assertThat(LedgerInput.reference("A".repeat(100))).hasSize(100)
        assertThrows<DomainException> { LedgerInput.reference("A".repeat(101)) }
        assertThrows<DomainException> { LedgerInput.reference("Synthetic\nreceipt") }
        assertThrows<DomainException> { LedgerInput.reference("Synthetic\u0000receipt") }
    }

    @ParameterizedTest
    @ValueSource(strings = ["-1", "0", "01", "1.0", " 1", "x", "9223372036854775808"])
    fun entryIdsNeverRoundCoerceOrOverflow(id: String) {
        assertThrows<DomainException> { LedgerInput.id(id) }
    }

    @Test
    fun decimalStringIdsAndExclusiveCursorsRetainLongPrecision() {
        assertThat(LedgerInput.id("9223372036854775807")).isEqualTo(Long.MAX_VALUE)
        assertThat(LedgerInput.cursor("0")).isZero()
        assertThat(LedgerInput.cursor("9007199254741001")).isEqualTo(9007199254741001L)
        for (method in PaymentMethod.entries) assertThat(LedgerInput.method(method.name))
            .isEqualTo(method)
        assertThrows<DomainException> { LedgerInput.method("cash") }
    }

    @ParameterizedTest
    @ValueSource(strings = ["2026-2-01", "2026-02-30", "0999-12-31", "2026-11-07Z", "10000-01-01"])
    fun financialDatesMustBeRealStrictSupportedCalendarDates(date: String) {
        assertThrows<DomainException> { LedgerInput.date(date) }
    }
}
