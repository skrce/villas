package com.villarosa

import com.villarosa.security.StaffAuthentication
import com.villarosa.security.StaffIdentity
import org.springframework.jdbc.core.ConnectionCallback
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.core.context.SecurityContextHolder

object TestData {
    fun reset(
        jdbc: JdbcTemplate,
        expectedUrl: String = "jdbc:h2:mem:villarosa",
        authenticatedOwner: Boolean = true,
        ownerIssuer: String = "http://127.0.0.1:19099",
    ) {
        val actual = checkNotNull(jdbc.execute(ConnectionCallback { it.metaData.url }))
        check(
            actual.substringBefore('?').substringBefore(';') ==
                expectedUrl.substringBefore('?').substringBefore(';')
        ) {
            "Refusing to clear an unexpected test database."
        }
        SecurityContextHolder.clearContext()
        val hasSessions =
            jdbc.execute(
                ConnectionCallback { connection ->
                    connection.metaData
                        .getTables(null, null, "SPRING_SESSION", arrayOf("TABLE"))
                        .use { it.next() }
                }
            ) == true
        if (hasSessions) {
            jdbc.update(
                "DELETE FROM SPRING_SESSION_ATTRIBUTES WHERE SESSION_PRIMARY_ID IS NOT NULL"
            )
            jdbc.update("DELETE FROM SPRING_SESSION WHERE PRIMARY_ID IS NOT NULL")
        }
        jdbc.update("DELETE FROM business_events WHERE id IS NOT NULL")
        for (table in
            listOf(
                "staff_events",
                "staff_invitations",
                "staff_accounts",
                "inventory_events",
                "inventory_operations",
                "reservations",
                "maintenance_blocks",
                "seasonal_rates",
                "customers",
                "apartments",
            )) {
            jdbc.update("DELETE FROM $table WHERE id IS NOT NULL")
        }
        if (authenticatedOwner) {
            seedOwner(jdbc, ownerIssuer, 0)
            SecurityContextHolder.getContext().authentication = StaffAuthentication(ownerIdentity())
        }
    }

    fun ownerIdentity(index: Int = 0) =
        StaffIdentity("00000000-0000-0000-0000-${(index + 1).toString().padStart(12, '0')}", 0)

    fun seedOwner(jdbc: JdbcTemplate, issuer: String = "http://127.0.0.1:19099", index: Int = 0) {
        jdbc.update(
            "INSERT INTO staff_accounts (id, property_id, issuer, subject, email, role, active, security_version, version, created_at) VALUES (?, 'villa-rosa', ?, ?, ?, 'OWNER', TRUE, 0, 0, CURRENT_TIMESTAMP(6))",
            ownerIdentity(index).id,
            issuer,
            if (index == 0) "synthetic-owner" else "synthetic-owner-$index",
            if (index == 0) "owner@example.test" else "owner-$index@example.test",
        )
    }
}
