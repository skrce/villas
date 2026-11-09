package com.villarosa

import java.sql.DriverManager
import java.sql.SQLException
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers

@Testcontainers
class RoomAllocationsMigrationIT {
    @Container val database = TestDatabases.postgres()

    @ParameterizedTest
    @MethodSource("prefixes")
    fun migrationResumesEachPrefixAndPreservesExistingAllocationAndPriceData(prefix: Int) {
        DatabaseMigrations.configured(database.jdbcUrl, database.username, database.password, "13")
            .migrate()
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use {
            connection ->
            connection.createStatement().use { sql ->
                sql.executeUpdate(
                    "INSERT INTO apartments(id,capacity,regular_price) VALUES(1,4,123),(2,4,456)"
                )
                sql.executeUpdate(
                    "INSERT INTO customers(id,first_name,last_name) VALUES(1,'Synthetic','Allocation')"
                )
                sql.executeUpdate(
                    "INSERT INTO reservations(id,customer_id,room_id,start_date,end_date,version) VALUES(1,1,1,'2030-01-01','2030-01-04',7),(2,1,1,'2030-02-01','2030-02-03',3)"
                )
                statements().take(prefix).forEach { sql.execute(it) }
                if (prefix >= 4) {
                    sql.executeUpdate("DELETE FROM reservation_allocations WHERE reservation_id=1")
                    sql.executeUpdate(
                        "INSERT INTO reservation_allocations(property_id,reservation_id,room_id,start_date,end_date) VALUES('villa-rosa',1,1,'2030-01-01','2030-01-02'),('villa-rosa',1,2,'2030-01-02','2030-01-04')"
                    )
                    sql.executeUpdate(
                        "UPDATE reservations SET room_id=2,room_from_date='2030-01-02' WHERE id=1"
                    )
                }
            }
        }
        val flyway =
            DatabaseMigrations.configured(
                database.jdbcUrl,
                database.username,
                database.password,
                "14",
            )
        assertThat(flyway.migrate().migrationsExecuted).isEqualTo(1)
        assertThat(flyway.migrate().migrationsExecuted).isZero()
        flyway.validate()
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use {
            connection ->
            connection.createStatement().use { sql ->
                sql.executeQuery("SELECT COUNT(*) FROM reservation_allocations").use { row ->
                    row.next()
                    assertThat(row.getInt(1)).isEqualTo(if (prefix >= 4) 3 else 2)
                }
                sql.executeQuery(
                        "SELECT version,accepted_quote_id,room_from_date FROM reservations WHERE id=1"
                    )
                    .use { row ->
                        row.next()
                        assertThat(row.getLong(1)).isEqualTo(7)
                        assertThat(row.getObject(2)).isNull()
                        assertThat(row.getString(3))
                            .isEqualTo(if (prefix >= 4) "2030-01-02" else "2030-01-01")
                    }
                sql.executeQuery("SELECT regular_price,base_rate_cents FROM apartments WHERE id=1")
                    .use { row ->
                        row.next()
                        assertThat(row.getInt(1)).isEqualTo(123)
                        assertThat(row.getObject(2)).isNull()
                    }
                for (setter in
                    listOf(
                        "end_date=start_date",
                        "start_date='0000-00-00'",
                        "room_id=999",
                        "property_id='other'",
                    )) assertThrows<SQLException> {
                    sql.executeUpdate(
                        "UPDATE reservation_allocations SET $setter WHERE reservation_id=2"
                    )
                }
            }
        }
    }

    companion object {
        private fun statements() =
            checkNotNull(
                    RoomAllocationsMigrationIT::class
                        .java
                        .getResource("/db/postgresql/V14__room_allocations.sql")
                )
                .readText()
                .split(';')
                .map(String::trim)
                .filter(String::isNotEmpty)

        @JvmStatic fun prefixes() = (0..statements().size).toList()
    }
}
