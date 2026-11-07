package com.villarosa

import java.sql.DriverManager
import java.time.Instant
import java.util.Calendar
import java.util.TimeZone
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers

@Testcontainers
class StayOperationsMigrationIT {
    @Container val database = TestDatabases.mariaDb()

    @ParameterizedTest
    @MethodSource("prefixes")
    fun upgradeResumesEveryStatementPrefixAndPreservesReservationAndReadiness(prefix: Int) {
        DatabaseMigrations.configured(database.jdbcUrl, database.username, database.password, "11")
            .migrate()
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use {
            connection ->
            connection.createStatement().use { sql ->
                sql.executeUpdate(
                    "INSERT INTO apartments (id,capacity,name,reference,regular_price) VALUES (1,4,'Synthetic migration room','OPS-1',123)"
                )
                sql.executeUpdate(
                    "INSERT INTO customers (id,first_name,last_name) VALUES (1,'Synthetic','Migration')"
                )
                sql.executeUpdate(
                    "INSERT INTO reservations (id,customer_id,room_id,start_date,end_date,status,version) VALUES (1,1,1,'2030-01-01','2030-01-03','ACTIVE',7),(2,1,1,'2030-02-01','2030-02-03','CANCELLED',3)"
                )
                statements().take(prefix).forEach { sql.execute(it) }
                val tableExists =
                    connection.metaData
                        .getTables(null, null, "room_readiness", arrayOf("TABLE"))
                        .use { it.next() }
                if (tableExists)
                    sql.executeUpdate(
                        "INSERT INTO room_readiness(room_id,property_id,state,version,changed_at) VALUES (1,'villa-rosa','CLEAN',4,'2026-11-07 00:00:00') ON DUPLICATE KEY UPDATE state='CLEAN',version=4"
                    )
            }
        }
        val flyway =
            DatabaseMigrations.configured(
                database.jdbcUrl,
                database.username,
                database.password,
                "12",
            )
        assertThat(flyway.migrate().migrationsExecuted).isEqualTo(1)
        assertThat(flyway.migrate().migrationsExecuted).isZero()
        flyway.validate()
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use {
            connection ->
            connection.createStatement().use { sql ->
                sql.executeQuery(
                        "SELECT status,stay_phase,version,accepted_quote_id,checked_in_at,checked_out_at FROM reservations ORDER BY id"
                    )
                    .use { row ->
                        assertThat(row.next()).isTrue()
                        assertThat(row.getString(1)).isEqualTo("ACTIVE")
                        assertThat(row.getString(2)).isEqualTo("CONFIRMED")
                        assertThat(row.getLong(3)).isEqualTo(7)
                        assertThat(row.getObject(4)).isNull()
                        assertThat(row.getObject(5)).isNull()
                        assertThat(row.getObject(6)).isNull()
                        assertThat(row.next()).isTrue()
                        assertThat(row.getString(1)).isEqualTo("CANCELLED")
                        assertThat(row.getString(2)).isEqualTo("CANCELLED")
                        assertThat(row.getLong(3)).isEqualTo(3)
                    }
                sql.executeQuery("SELECT state,version FROM room_readiness WHERE room_id=1").use {
                    row ->
                    assertThat(row.next()).isTrue()
                    val hadReadiness =
                        statements().take(prefix).any {
                            it.startsWith("CREATE TABLE IF NOT EXISTS room_readiness")
                        }
                    assertThat(row.getString(1)).isEqualTo(if (hadReadiness) "CLEAN" else "DIRTY")
                    assertThat(row.getLong(2)).isEqualTo(if (hadReadiness) 4 else 0)
                }
                sql.executeQuery("SELECT regular_price,base_rate_cents FROM apartments WHERE id=1")
                    .use { row ->
                        row.next()
                        assertThat(row.getInt(1)).isEqualTo(123)
                        assertThat(row.getObject(2)).isNull()
                    }
                for (query in
                    listOf(
                        "UPDATE reservations SET stay_phase='CHECKED_IN' WHERE id=1",
                        "UPDATE reservations SET stay_phase='NO_SHOW' WHERE id=1",
                        "UPDATE reservations SET stay_phase='confirmed' WHERE id=1",
                        "UPDATE room_readiness SET state='clean' WHERE room_id=1",
                        "UPDATE room_readiness SET version=-1 WHERE room_id=1",
                    )) org.junit.jupiter.api.assertThrows<java.sql.SQLException> {
                    sql.executeUpdate(query)
                }
            }
        }
    }

    @Test
    fun readinessBackfillStoresUtcWithANonUtcDatabaseSession() {
        DatabaseMigrations.configured(database.jdbcUrl, database.username, database.password, "11")
            .migrate()
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use {
            connection ->
            connection.createStatement().use { sql ->
                sql.execute("SET time_zone='+03:00'")
                sql.executeUpdate(
                    "INSERT INTO apartments(id,capacity,name,reference) VALUES (1,4,'Synthetic UTC room','UTC-1')"
                )
                val before = Instant.now().minusSeconds(1)
                statements().forEach { sql.execute(it) }
                sql.executeQuery("SELECT changed_at FROM room_readiness WHERE room_id=1").use { row
                    ->
                    assertThat(row.next()).isTrue()
                    val actual =
                        row.getTimestamp(1, Calendar.getInstance(TimeZone.getTimeZone("UTC")))
                            .toInstant()
                    assertThat(actual).isBetween(before, Instant.now().plusSeconds(1))
                }
            }
        }
    }

    companion object {
        private fun statements() =
            checkNotNull(
                    StayOperationsMigrationIT::class
                        .java
                        .getResource("/db/migration/V12__stay_operations.sql")
                )
                .readText()
                .split(';')
                .map(String::trim)
                .filter(String::isNotEmpty)

        @JvmStatic fun prefixes() = (0..statements().size).toList()
    }
}
