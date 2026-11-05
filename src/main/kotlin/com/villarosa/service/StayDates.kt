package com.villarosa.service

import com.villarosa.exception.ExceptionHandler.ClientException
import java.time.LocalDate
import java.time.format.DateTimeParseException
import java.time.temporal.ChronoUnit

data class StayDates(val start: LocalDate, val end: LocalDate) {
    init {
        if (!end.isAfter(start)) throw ClientException("Checkout must be after check-in.")
    }

    val nights: Long
        get() = ChronoUnit.DAYS.between(start, end)

    fun overlaps(otherStart: LocalDate, otherEnd: LocalDate): Boolean =
        start < otherEnd && end > otherStart

    companion object {
        private val shape = Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}")

        fun parse(start: String, end: String): StayDates {
            require(start.isNotEmpty() && end.isNotEmpty()) { "Dates should not be empty" }
            return StayDates(parseDate(start), parseDate(end))
        }

        private fun parseDate(value: String): LocalDate {
            if (!shape.matches(value)) throw ClientException("Date should have format: yyyy-MM-dd")
            val date =
                try {
                    LocalDate.parse(value)
                } catch (_: DateTimeParseException) {
                    throw ClientException("Date should have format: yyyy-MM-dd")
                }
            if (date.year < 1000) throw ClientException("Date should have format: yyyy-MM-dd")
            return date
        }
    }
}
