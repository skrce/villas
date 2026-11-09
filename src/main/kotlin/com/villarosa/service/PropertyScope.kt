package com.villarosa.service

object PropertyScope {
    val ID = identifier(System.getenv("VILLAS_PROPERTY_ID") ?: "villa-rosa")
    val NAME = displayName(System.getenv("VILLAS_PROPERTY_NAME") ?: "Villa Rosa")

    fun identifier(value: String): String {
        require(value.matches(Regex("[a-z0-9][a-z0-9-]{0,63}"))) {
            "Configure a valid property identifier."
        }
        return value
    }

    fun displayName(value: String): String {
        require(value.isNotBlank() && value.length <= 100 && value.none(Char::isISOControl)) {
            "Configure a valid property name."
        }
        return value.trim()
    }
}
