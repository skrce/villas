package com.villarosa

import java.sql.DriverManager
import java.sql.SQLException
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers

@Testcontainers
class ManualLedgerMigrationIT {
    @Container val database = TestDatabases.mariaDb()

    @ParameterizedTest
    @ValueSource(ints = [0, 1, 2])
    fun migrationResumesEachStatementPrefixAndPreservesBookingsAndEntries(prefix: Int) {
        DatabaseMigrations.configured(database.jdbcUrl, database.username, database.password, "12")
            .migrate()
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use {
            connection ->
            connection.createStatement().use { sql ->
                sql.executeUpdate("INSERT INTO apartments(id,capacity) VALUES(1,4)")
                sql.executeUpdate(
                    "INSERT INTO customers(id,first_name,last_name) VALUES(1,'Synthetic','Ledger')"
                )
                sql.executeUpdate(
                    "INSERT INTO reservations(id,customer_id,room_id,start_date,end_date,version) VALUES(1,1,1,'2030-01-01','2030-01-03',7),(2,1,1,'2030-02-01','2030-02-03',2)"
                )
                sql.executeUpdate(
                    "INSERT INTO staff_accounts(id,property_id,issuer,subject,email,role,active,security_version,version,created_at) VALUES('00000000-0000-0000-0000-000000000001','villa-rosa','http://synthetic','synthetic','owner@example.test','OWNER',TRUE,0,0,UTC_TIMESTAMP(6))"
                )
                statements().take(prefix).forEach { sql.execute(it) }
                if (prefix == 2) {
                    sql.executeUpdate(paymentSql())
                    sql.executeUpdate("UPDATE reservations SET finance_revision=3 WHERE id=1")
                }
            }
        }
        val flyway =
            DatabaseMigrations.configured(
                database.jdbcUrl,
                database.username,
                database.password,
                "13",
            )
        assertThat(flyway.migrate().migrationsExecuted).isEqualTo(1)
        assertThat(flyway.migrate().migrationsExecuted).isZero()
        flyway.validate()
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use {
            connection ->
            connection.createStatement().use { sql ->
                if (prefix < 2) sql.executeUpdate(paymentSql())
                sql.executeQuery(
                        "SELECT version,finance_revision,accepted_quote_id FROM reservations WHERE id=1"
                    )
                    .use { row ->
                        assertThat(row.next()).isTrue()
                        assertThat(row.getLong(1)).isEqualTo(7)
                        assertThat(row.getLong(2)).isEqualTo(if (prefix == 2) 3 else 0)
                        assertThat(row.getObject(3)).isNull()
                    }
                sql.executeQuery("SELECT amount_cents FROM ledger_entries WHERE id=1").use { row ->
                    assertThat(row.next()).isTrue()
                    assertThat(row.getLong(1)).isEqualTo(2501)
                }
                for (change in
                    listOf(
                        "amount_cents=0",
                        "amount_cents=9007199254740992",
                        "currency='eur'",
                        "kind='payment'",
                        "method='cash'",
                        "kind='REFUND'",
                        "kind='REVERSAL'",
                        "effective_date='0000-00-00'",
                        "reservation_id=999",
                    )) assertThrows<SQLException> {
                    sql.executeUpdate("UPDATE ledger_entries SET $change WHERE id=1")
                }
                sql.executeUpdate(
                    "INSERT INTO ledger_entries(id,property_id,reservation_id,reservation_version,actor_id,operation_key,kind,currency,amount_cents,method,payment_id,reason,effective_date,recorded_at) VALUES(2,'villa-rosa',1,9,'00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','REFUND','EUR',501,'CASH',1,'Synthetic refund','2026-11-07',UTC_TIMESTAMP(6))"
                )
                assertThrows<SQLException> {
                    sql.executeUpdate("UPDATE ledger_entries SET reservation_id=2 WHERE id=2")
                }
                assertThrows<SQLException> {
                    sql.executeUpdate("UPDATE ledger_entries SET reason=NULL WHERE id=2")
                }
            }
        }
    }

    private fun paymentSql() =
        "INSERT INTO ledger_entries(id,property_id,reservation_id,reservation_version,actor_id,operation_key,kind,currency,amount_cents,method,effective_date,recorded_at) VALUES(1,'villa-rosa',1,8,'00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','PAYMENT','EUR',2501,'CASH','2026-11-07',UTC_TIMESTAMP(6))"

    private fun statements() =
        checkNotNull(javaClass.getResource("/db/migration/V13__manual_ledger.sql"))
            .readText()
            .split(';')
            .map(String::trim)
            .filter(String::isNotEmpty)
}
