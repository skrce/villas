package com.villarosa

import java.sql.DriverManager
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers

@Testcontainers
class BookingQuoteMigrationIT {
    @Container val database = TestDatabases.mariaDb()

    @ParameterizedTest
    @ValueSource(ints = [0, 1, 2, 3, 4])
    fun quoteUpgradeResumesEveryDdlPrefixWithoutInventingHistoricalPrices(prefix: Int) {
        DatabaseMigrations.configured(database.jdbcUrl, database.username, database.password, "10")
            .migrate()
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use {
            connection ->
            connection.createStatement().use { sql ->
                sql.executeUpdate(
                    "INSERT INTO apartments (id,capacity,name,reference,regular_price) VALUES (1,4,'Synthetic room','R-1',123)"
                )
                sql.executeUpdate(
                    "INSERT INTO customers (id,first_name,last_name) VALUES (1,'Walk','In')"
                )
                sql.executeUpdate(
                    "INSERT INTO reservations (customer_id,room_id,start_date,end_date) VALUES (1,1,'2030-01-01','2030-01-03')"
                )
                val statements =
                    checkNotNull(javaClass.getResource("/db/migration/V11__booking_quotes.sql"))
                        .readText()
                        .split(';')
                        .map { it.trim() }
                        .filter { it.isNotEmpty() }
                assertThat(statements).hasSize(4)
                statements.take(prefix).forEach { sql.execute(it) }
            }
        }
        val flyway =
            DatabaseMigrations.configured(
                database.jdbcUrl,
                database.username,
                database.password,
                "11",
            )
        assertThat(flyway.migrate().migrationsExecuted).isEqualTo(1)
        assertThat(flyway.migrate().migrationsExecuted).isZero()
        flyway.validate()
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use {
            connection ->
            connection.createStatement().use { sql ->
                sql.executeQuery(
                        "SELECT accepted_quote_id,guest_count FROM reservations WHERE id=1"
                    )
                    .use { row ->
                        assertThat(row.next()).isTrue()
                        assertThat(row.getString(1)).isNull()
                        assertThat(row.getInt(2)).isEqualTo(1)
                    }
                for (table in listOf("booking_quotes", "reservation_prices")) sql.executeQuery(
                        "SELECT COUNT(*) FROM $table"
                    )
                    .use { row ->
                        row.next()
                        assertThat(row.getInt(1)).isZero()
                    }
            }
        }
    }
}
