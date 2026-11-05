package com.villarosa

import org.springframework.jdbc.core.ConnectionCallback
import org.springframework.jdbc.core.JdbcTemplate

object TestData {
    fun reset(jdbc: JdbcTemplate, expectedUrl: String = "jdbc:h2:mem:villarosa") {
        val actual = checkNotNull(jdbc.execute(ConnectionCallback { it.metaData.url }))
        check(
            actual.substringBefore('?').substringBefore(';') ==
                expectedUrl.substringBefore('?').substringBefore(';')
        ) {
            "Refusing to clear an unexpected test database."
        }
        for (table in
            listOf(
                "inventory_events",
                "inventory_operations",
                "reservations",
                "maintenance_blocks",
                "customers",
                "apartments",
            )) {
            jdbc.update("DELETE FROM $table WHERE id IS NOT NULL")
        }
    }
}
