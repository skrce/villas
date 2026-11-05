package com.villarosa

import java.sql.Connection
import java.sql.DriverManager
import java.sql.SQLException
import org.assertj.core.api.Assertions.assertThat
import org.flywaydb.core.api.FlywayException
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers

@Testcontainers
class MigrationsIT {
    @Container val database = TestDatabases.mariaDb()

    private fun connection(): Connection =
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password)

    @Test
    fun emptyDatabaseMigratesAndRerunsWithoutBusinessData() {
        val flyway =
            DatabaseMigrations.configured(database.jdbcUrl, database.username, database.password)
        assertThat(flyway.migrate().migrationsExecuted).isEqualTo(2)
        assertThat(flyway.migrate().migrationsExecuted).isZero()
        flyway.validate()
        connection().use { connection ->
            for (table in listOf("apartments", "customers", "reservations")) {
                connection.createStatement().use { statement ->
                    statement.executeQuery("SELECT COUNT(*) FROM $table").use { result ->
                        assertThat(result.next()).isTrue()
                        assertThat(result.getInt(1)).isZero()
                    }
                }
            }
        }
        assertThrows<FlywayException> { flyway.clean() }
    }

    @Test
    fun upgradePreservesUnicodeBookingsAndAddsValidDefaults() {
        DatabaseMigrations.configured(database.jdbcUrl, database.username, database.password, "1")
            .migrate()
        connection().use { connection ->
            connection.createStatement().use { statement ->
                statement.executeUpdate(
                    "INSERT INTO apartments (id, capacity, view) VALUES (1, 2, 'Езеро')"
                )
                statement.executeUpdate(
                    "INSERT INTO customers (id, first_name, last_name, phone, address) VALUES (1, 'Test', 'Гостин', '000', 'Synthetic')"
                )
                statement.executeUpdate(
                    "INSERT INTO reservations (id, customer_id, room_id, start_date, end_date) VALUES (1, 1, 1, '2026-03-28', '2026-03-30')"
                )
            }
        }
        assertThat(
                DatabaseMigrations.migrate(database.jdbcUrl, database.username, database.password)
                    .migrationsExecuted
            )
            .isEqualTo(1)
        connection().use { connection ->
            connection.createStatement().use { statement ->
                statement
                    .executeQuery(
                        "SELECT r.start_date, r.end_date, r.guest_count, r.status, r.version, c.last_name FROM reservations r JOIN customers c ON c.id=r.customer_id WHERE r.id=1"
                    )
                    .use { result ->
                        assertThat(result.next()).isTrue()
                        assertThat(result.getString(1)).isEqualTo("2026-03-28")
                        assertThat(result.getString(2)).isEqualTo("2026-03-30")
                        assertThat(result.getInt(3)).isEqualTo(1)
                        assertThat(result.getString(4)).isEqualTo("ACTIVE")
                        assertThat(result.getLong(5)).isZero()
                        assertThat(result.getString(6)).isEqualTo("Гостин")
                    }
                for (sql in
                    listOf(
                        "INSERT INTO apartments (capacity) VALUES (0)",
                        "INSERT INTO apartments (capacity, regular_price) VALUES (2, -1)",
                        "UPDATE reservations SET status='active' WHERE id=1",
                        "UPDATE reservations SET status='Cancelled' WHERE id=1",
                        "UPDATE reservations SET status='ACTIVE ' WHERE id=1",
                        "INSERT INTO reservations (customer_id, room_id, start_date, end_date) VALUES (999, 1, '2026-04-01', '2026-04-03')",
                        "INSERT INTO reservations (customer_id, room_id, start_date, end_date) VALUES (1, 999, '2026-04-01', '2026-04-03')",
                        "INSERT INTO reservations (customer_id, room_id, start_date, end_date) VALUES (1, 1, '2026-04-01', '2026-04-01')",
                        "INSERT INTO reservations (customer_id, room_id, start_date, end_date, guest_count) VALUES (1, 1, '2026-04-01', '2026-04-03', 0)",
                        "INSERT INTO reservations (property_id, customer_id, room_id, start_date, end_date) VALUES ('other', 1, 1, '2026-04-01', '2026-04-03')",
                    )) assertThrows<SQLException> { statement.executeUpdate(sql) }
                statement.executeQuery("SELECT COUNT(*) FROM reservations").use { result ->
                    result.next()
                    assertThat(result.getInt(1)).isEqualTo(1)
                }
            }
        }
    }

    @Test
    fun unversionedDatabaseIsRejectedWithoutAdoptingOrDeletingItsData() {
        connection().use { connection ->
            connection.createStatement().use { statement ->
                statement.execute("CREATE TABLE retained_marker (id INT PRIMARY KEY)")
                statement.executeUpdate("INSERT INTO retained_marker VALUES (1)")
            }
        }
        assertThrows<FlywayException> {
            DatabaseMigrations.migrate(database.jdbcUrl, database.username, database.password)
        }
        connection().use { connection ->
            connection.createStatement().use { statement ->
                statement.executeQuery("SELECT COUNT(*) FROM retained_marker").use { result ->
                    result.next()
                    assertThat(result.getInt(1)).isEqualTo(1)
                }
            }
        }
    }

    @Test
    fun zeroComponentsAndImpossibleDaysCannotBeStoredEvenWithPermissiveSqlMode() {
        DatabaseMigrations.migrate(database.jdbcUrl, database.username, database.password)
        connection().use { connection ->
            connection.createStatement().use { statement ->
                statement.executeUpdate("INSERT INTO apartments (id, capacity) VALUES (1, 2)")
                statement.executeUpdate(
                    "INSERT INTO customers (id, first_name, last_name, phone, address) VALUES (1, 'Test', 'Guest', '000', 'Synthetic')"
                )
                statement.execute("SET SESSION sql_mode='ALLOW_INVALID_DATES'")
                for ((start, end) in
                    listOf(
                        "2026-00-01" to "2026-01-03",
                        "2026-01-00" to "2026-01-03",
                        "2026-01-01" to "2026-02-00",
                        "2026-01-01" to "2027-00-01",
                        "2026-02-30" to "2026-03-03",
                        "2026-02-01" to "2026-02-30",
                    )) {
                    assertThrows<SQLException> {
                        statement.executeUpdate(
                            "INSERT INTO reservations (customer_id, room_id, start_date, end_date) VALUES (1, 1, '$start', '$end')"
                        )
                    }
                }
            }
        }
    }
}
