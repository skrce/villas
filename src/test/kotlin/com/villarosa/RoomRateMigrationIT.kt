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
class RoomRateMigrationIT {
    @Container val database = TestDatabases.postgres()

    @ParameterizedTest
    @ValueSource(ints = [0, 1, 2])
    fun rateUpgradePreservesOldPricesAndBookingsAndResumesEveryDdlPrefix(prefix: Int) {
        DatabaseMigrations.configured(database.jdbcUrl, database.username, database.password, "9")
            .migrate()
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use {
            connection ->
            connection.createStatement().use { sql ->
                sql.executeUpdate(
                    "INSERT INTO apartments (id,capacity,name,reference,regular_price,top_season_price) VALUES (1,4,'Synthetic room','TEST-1',123,234)"
                )
                sql.executeUpdate(
                    "INSERT INTO customers (id,first_name,last_name) VALUES (1,'Walk','In')"
                )
                sql.executeUpdate(
                    "INSERT INTO reservations (customer_id,room_id,start_date,end_date) VALUES (1,1,'2030-01-01','2030-01-03')"
                )
                val statements =
                    checkNotNull(javaClass.getResource("/db/postgresql/V10__room_rates.sql"))
                        .readText()
                        .split(';')
                        .map { it.trim() }
                        .filter { it.isNotEmpty() }
                statements.take(prefix).forEach { sql.execute(it) }
            }
        }
        val flyway =
            DatabaseMigrations.configured(
                database.jdbcUrl,
                database.username,
                database.password,
                "10",
            )
        assertThat(flyway.migrate().migrationsExecuted).isEqualTo(1)
        assertThat(flyway.migrate().migrationsExecuted).isZero()
        flyway.validate()
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use {
            connection ->
            connection.createStatement().use { sql ->
                sql.executeQuery(
                        "SELECT base_rate_cents,rate_version,rate_currency,regular_price,top_season_price FROM apartments WHERE id=1"
                    )
                    .use { row ->
                        assertThat(row.next()).isTrue()
                        assertThat(row.getObject(1)).isNull()
                        assertThat(row.getLong(2)).isZero()
                        assertThat(row.getString(3)).isEqualTo("EUR")
                        assertThat(row.getInt(4)).isEqualTo(123)
                        assertThat(row.getInt(5)).isEqualTo(234)
                    }
                sql.executeQuery(
                        "SELECT COUNT(*) FROM reservations WHERE room_id=1 AND status='ACTIVE'"
                    )
                    .use { row ->
                        row.next()
                        assertThat(row.getInt(1)).isEqualTo(1)
                    }
                sql.executeQuery("SELECT COUNT(*) FROM seasonal_rates").use { row ->
                    row.next()
                    assertThat(row.getInt(1)).isZero()
                }
                for (invalid in
                    listOf(
                        "INSERT INTO seasonal_rates VALUES ('bad-amount','villa-rosa',1,'Test','2030-01-01','2030-01-02',0)",
                        "INSERT INTO seasonal_rates VALUES ('bad-dates','villa-rosa',1,'Test','2030-01-01','2030-01-01',100)",
                        "INSERT INTO seasonal_rates VALUES ('other-property','foreign-property',1,'Test','2030-01-01','2030-01-02',100)",
                        "INSERT INTO seasonal_rates VALUES ('missing-room','villa-rosa',999,'Test','2030-01-01','2030-01-02',100)",
                    )) assertThrows<SQLException> { sql.executeUpdate(invalid) }

                assertThrows<SQLException> {
                    sql.executeUpdate(
                        "INSERT INTO seasonal_rates VALUES ('zero-date','villa-rosa',1,'Test','0000-00-00','2030-01-02',100)"
                    )
                }
            }
        }
    }
}
