package com.villarosa

import com.villarosa.security.StaffAuthentication
import com.villarosa.security.StaffIdentity
import org.springframework.jdbc.core.ConnectionCallback
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.core.context.SecurityContextHolder

object TestData {
    fun authentication(
        identity: StaffIdentity = ownerIdentity(),
        businessId: String = "villa-rosa",
    ): StaffAuthentication {
        val actor =
            identity.copy(
                personId = identity.personId ?: identity.id,
                personVersion = identity.personVersion ?: 0,
            )
        com.villarosa.security.BusinessScope.select(
            com.villarosa.security.AuthorizedBusiness(businessId, actor)
        )
        return StaffAuthentication(
            com.villarosa.security.StaffSessionIdentity(
                actor.personId!!,
                actor.personVersion!!,
                mapOf(businessId to actor),
            )
        )
    }

    fun identity(jdbc: JdbcTemplate, account: com.villarosa.security.StaffAccount): StaffIdentity =
        jdbc
            .query(
                "SELECT id,security_version FROM staff_identities WHERE issuer=? AND subject=?",
                { row, _ ->
                    StaffIdentity(
                        account.id,
                        account.securityVersion,
                        row.getString(1),
                        row.getLong(2),
                    )
                },
                account.issuer,
                account.subject,
            )
            .single()

    fun hasTable(jdbc: JdbcTemplate, name: String): Boolean =
        jdbc.execute(
            ConnectionCallback { connection ->
                connection.metaData.getTables(null, null, name, arrayOf("TABLE")).use { it.next() }
            }
        ) == true

    fun registerIdentity(
        jdbc: JdbcTemplate,
        id: String,
        issuer: String,
        subject: String,
        email: String,
    ) {
        if (hasTable(jdbc, "staff_identities"))
            jdbc.update(
                "INSERT INTO staff_identities(id,issuer,subject,email,security_version,version,created_at) SELECT ?,?,?,?,0,0,CURRENT_TIMESTAMP(6) WHERE NOT EXISTS (SELECT 1 FROM staff_identities WHERE issuer=? AND subject=?)",
                id,
                issuer,
                subject,
                email,
                issuer,
                subject,
            )
    }

    fun registerBusiness(jdbc: JdbcTemplate, id: String) {
        jdbc.update(
            "INSERT INTO businesses(id,name,active,currency,property_timezone,version,created_at) SELECT ?,?,TRUE,'EUR','Europe/Skopje',0,CURRENT_TIMESTAMP(6) WHERE NOT EXISTS (SELECT 1 FROM businesses WHERE id=?)",
            id,
            "Synthetic $id",
            id,
        )
    }

    fun configureSyntheticRate(jdbc: JdbcTemplate, roomId: Int) {
        jdbc.update(
            "UPDATE apartments SET base_rate_cents=5001, rate_version=1 WHERE property_id='villa-rosa' AND id=? AND base_rate_cents IS NULL",
            roomId,
        )
    }

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
        com.villarosa.security.BusinessScope.select(
            com.villarosa.security.AuthorizedBusiness("villa-rosa", ownerIdentity())
        )
        registerBusiness(jdbc, "villa-rosa")
        if (hasTable(jdbc, "staff_identity_lock"))
            jdbc.update(
                "INSERT INTO staff_identity_lock(singleton,lock_token) SELECT 1,0 WHERE NOT EXISTS (SELECT 1 FROM staff_identity_lock WHERE singleton=1)"
            )
        if (hasTable(jdbc, "business_onboarding"))
            jdbc.update("DELETE FROM business_onboarding WHERE property_id IS NOT NULL")
        val hasSessions =
            jdbc.execute(
                ConnectionCallback { connection ->
                    connection.metaData
                        .getTables(
                            null,
                            null,
                            if (connection.metaData.databaseProductName == "PostgreSQL")
                                "spring_session"
                            else "SPRING_SESSION",
                            arrayOf("TABLE"),
                        )
                        .use { it.next() }
                }
            ) == true
        if (hasSessions) {
            jdbc.update(
                "DELETE FROM SPRING_SESSION_ATTRIBUTES WHERE SESSION_PRIMARY_ID IS NOT NULL"
            )
            jdbc.update("DELETE FROM SPRING_SESSION WHERE PRIMARY_ID IS NOT NULL")
        }
        jdbc.update("DELETE FROM reservation_allocations WHERE id IS NOT NULL")
        jdbc.update("DELETE FROM business_events WHERE id IS NOT NULL")
        jdbc.update("DELETE FROM ledger_entries WHERE kind='REVERSAL'")
        jdbc.update("DELETE FROM ledger_entries WHERE kind='REFUND'")
        jdbc.update("DELETE FROM ledger_entries WHERE kind='PAYMENT'")
        jdbc.update("DELETE FROM readiness_events WHERE id IS NOT NULL")
        jdbc.update("DELETE FROM room_readiness WHERE room_id IS NOT NULL")
        for (table in
            listOf(
                "staff_events",
                "staff_invitations",
                "inventory_events",
                "inventory_operations",
                "reservation_prices",
                "reservations",
                "booking_quotes",
                "maintenance_blocks",
                "seasonal_rates",
                "customers",
                "apartments",
                "staff_accounts",
            )) {
            jdbc.update("DELETE FROM $table WHERE id IS NOT NULL")
        }
        if (hasTable(jdbc, "staff_identities"))
            jdbc.update("DELETE FROM staff_identities WHERE id IS NOT NULL")
        if (authenticatedOwner) {
            seedOwner(jdbc, ownerIssuer, 0)
            SecurityContextHolder.getContext().authentication =
                TestData.authentication(ownerIdentity())
        }
    }

    fun ownerIdentity(index: Int = 0) =
        StaffIdentity(
            "00000000-0000-0000-0000-${(index + 1).toString().padStart(12, '0')}",
            0,
            "00000000-0000-0000-0000-${(index + 1).toString().padStart(12, '0')}",
            0,
        )

    fun seedOwner(jdbc: JdbcTemplate, issuer: String = "http://127.0.0.1:19099", index: Int = 0) {
        registerIdentity(
            jdbc,
            ownerIdentity(index).id,
            issuer,
            if (index == 0) "synthetic-owner" else "synthetic-owner-$index",
            if (index == 0) "owner@example.test" else "owner-$index@example.test",
        )
        jdbc.update(
            "INSERT INTO staff_accounts (id, property_id, issuer, subject, email, role, active, security_version, version, created_at) VALUES (?, 'villa-rosa', ?, ?, ?, 'OWNER', TRUE, 0, 0, CURRENT_TIMESTAMP(6))",
            ownerIdentity(index).id,
            issuer,
            if (index == 0) "synthetic-owner" else "synthetic-owner-$index",
            if (index == 0) "owner@example.test" else "owner-$index@example.test",
        )
    }
}
