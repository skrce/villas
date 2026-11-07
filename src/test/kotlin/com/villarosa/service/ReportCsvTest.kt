package com.villarosa.service

import com.villarosa.exception.DomainException
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource

class ReportCsvTest {
    @ParameterizedTest
    @ValueSource(
        strings =
            [
                "=SUM(A1:A2)",
                "+42",
                "-1+2",
                "@SUM(A1)",
                "  =cmd()",
                "\t=cmd()",
                "\r=cmd()",
                "\n=cmd()",
                "\uFEFF=cmd()",
                "\u0000=cmd()",
                "\u00a0=cmd()",
            ]
    )
    fun protectsFormulaTextEvenAfterLeadingWhitespace(value: String) {
        assertThat(ReportCsv.cell(value)).startsWith("\"'").endsWith("\"")
    }

    @Test
    fun quotesCommasQuotesLineBreaksAndUnicode() {
        assertThat(ReportCsv.cell("Синтетички, \"Гост\"\nsecond line"))
            .isEqualTo("\"Синтетички, \"\"Гост\"\"\nsecond line\"")
        assertThat(ReportCsv.cell("9007199254740993")).isEqualTo("\"9007199254740993\"")
    }

    @Test
    fun rejectsOversizeUtf8InsteadOfReturningPartialCsv() {
        val report =
            PeriodReport(
                ReportKind.OCCUPANCY,
                "2026-01-01",
                "2026-01-02",
                "2026-01-01",
                null,
                "hash",
                ReportTotals(),
                listOf(OccupancyRow(1, "Ж".repeat(3 * 1024 * 1024), "A", true, 1, 0, 1, 0)),
                emptyList(),
                emptyList(),
                emptyList(),
                emptyList(),
            )
        assertThat(assertThrows<DomainException> { ReportCsv.encode(report) }.code)
            .isEqualTo("EXPORT_TOO_LARGE")
    }
}
