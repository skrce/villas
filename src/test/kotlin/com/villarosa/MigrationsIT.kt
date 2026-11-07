package com.villarosa

import java.nio.file.Files
import java.nio.file.Path
import java.sql.Connection
import java.sql.DriverManager
import java.sql.SQLException
import org.assertj.core.api.Assertions.assertThat
import org.flywaydb.core.Flyway
import org.flywaydb.core.api.FlywayException
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.api.io.TempDir
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers

@Testcontainers
class MigrationsIT {
    @Container val database = TestDatabases.mariaDb()
    @TempDir lateinit var recovery: Path

    private fun connection(): Connection =
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password)

    @Test
    fun emptyDatabaseMigratesAndRerunsWithoutBusinessData() {
        val flyway =
            DatabaseMigrations.configured(database.jdbcUrl, database.username, database.password)
        assertThat(flyway.migrate().migrationsExecuted).isEqualTo(15)
        assertThat(flyway.migrate().migrationsExecuted).isZero()
        flyway.validate()
        connection().use { connection ->
            for (table in
                listOf(
                    "apartments",
                    "customers",
                    "reservations",
                    "maintenance_blocks",
                    "inventory_operations",
                    "inventory_events",
                    "staff_accounts",
                    "staff_invitations",
                    "staff_events",
                    "room_readiness",
                    "readiness_events",
                    "ledger_entries",
                    "reservation_allocations",
                    "recovery_events",
                )) {
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
            .isEqualTo(14)
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
    fun staffSchemaRejectsUnapprovedRolesNoncanonicalEmailsAndBrokenReferences() {
        DatabaseMigrations.migrate(database.jdbcUrl, database.username, database.password)
        connection().use { connection ->
            connection.createStatement().use { statement ->
                val id = "00000000-0000-0000-0000-000000000001"
                statement.executeUpdate(
                    "INSERT INTO staff_accounts (id, property_id, issuer, subject, email, created_at) VALUES ('$id', 'villa-rosa', 'https://accounts.google.com', 'synthetic-owner', 'owner@example.test', CURRENT_TIMESTAMP(6))"
                )
                for (sql in
                    listOf(
                        "UPDATE staff_accounts SET role='FRONT_DESK' WHERE id='$id'",
                        "UPDATE staff_accounts SET active=2 WHERE id='$id'",
                        "UPDATE staff_accounts SET role='owner' WHERE id='$id'",
                        "UPDATE staff_accounts SET email='Owner@example.test' WHERE id='$id'",
                        "UPDATE staff_accounts SET security_version=-1 WHERE id='$id'",
                        "INSERT INTO staff_events (property_id, actor_id, kind, subject_type, subject_id, occurred_at) VALUES ('other', '$id', 'TEST', 'STAFF', '$id', CURRENT_TIMESTAMP(6))",
                        "INSERT INTO staff_invitations (id, property_id, email, state, created_at, expires_at) VALUES ('$id', 'villa-rosa', 'owner@example.test', 'PENDING', '2026-11-06 00:00:00', '2026-11-06 00:00:00')",
                    )) assertThrows<SQLException> { statement.executeUpdate(sql) }
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
                    assertThrows<SQLException> {
                        statement.executeUpdate(
                            "INSERT INTO maintenance_blocks (room_id, start_date, end_date, reason) VALUES (1, '$start', '$end', 'Synthetic')"
                        )
                    }
                }
            }
        }
    }

    @Test
    fun readIndexUpgradePreservesBookingsAndTheirSavedOperationHistory() {
        DatabaseMigrations.configured(database.jdbcUrl, database.username, database.password, "3")
            .migrate()
        val outcome =
            """{"key":"00000000-0000-0000-0000-000000000001","kind":"CREATE","resourceId":1}"""
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
                statement.executeUpdate(
                    "INSERT INTO inventory_operations (property_id, actor_id, operation_kind, operation_key, request_hash, result_json) VALUES ('villa-rosa', 'development', 'CREATE', '00000000-0000-0000-0000-000000000001', REPEAT('0', 64), '$outcome')"
                )
                statement.executeUpdate(
                    "INSERT INTO inventory_events (property_id, actor_id, operation_key, kind, reservation_id, resource_version, room_id, start_date, end_date, guest_count, occurred_at) VALUES ('villa-rosa', 'development', '00000000-0000-0000-0000-000000000001', 'CREATED', 1, 0, 1, '2026-03-28', '2026-03-30', 1, CURRENT_TIMESTAMP(6))"
                )
            }
        }
        val flyway =
            DatabaseMigrations.configured(
                database.jdbcUrl,
                database.username,
                database.password,
                "4",
            )
        assertThat(flyway.migrate().migrationsExecuted).isEqualTo(1)
        assertThat(flyway.migrate().migrationsExecuted).isZero()
        connection().use { connection ->
            connection.createStatement().use { statement ->
                statement
                    .executeQuery(
                        "SELECT c.last_name, r.start_date, o.result_json, e.kind FROM reservations r JOIN customers c ON c.id=r.customer_id JOIN inventory_events e ON e.reservation_id=r.id JOIN inventory_operations o ON o.operation_key=e.operation_key WHERE r.id=1"
                    )
                    .use { result ->
                        assertThat(result.next()).isTrue()
                        assertThat(result.getString(1)).isEqualTo("Гостин")
                        assertThat(result.getString(2)).isEqualTo("2026-03-28")
                        assertThat(result.getString(3)).isEqualTo(outcome)
                        assertThat(result.getString(4)).isEqualTo("CREATED")
                    }
                statement
                    .executeQuery(
                        "SHOW INDEX FROM reservations WHERE Key_name='reservation_calendar'"
                    )
                    .use { result -> assertThat(result.next()).isTrue() }
            }
        }
    }

    @Test
    fun partialDdlNeedsReviewedRepairAndRerunsWithoutDroppingSavedRecords() {
        DatabaseMigrations.migrate(database.jdbcUrl, database.username, database.password)
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
        Files.writeString(
            recovery.resolve("V999__synthetic_recovery.sql"),
            """
            CREATE TABLE IF NOT EXISTS recovery_marker (id INT PRIMARY KEY);
            INSERT IGNORE INTO recovery_marker (id) VALUES (1);
            ALTER TABLE migration_precondition ADD COLUMN IF NOT EXISTS ready INT;
            """
                .trimIndent(),
        )
        val flyway =
            Flyway.configure()
                .dataSource(database.jdbcUrl, database.username, database.password)
                .locations("classpath:db/migration", "filesystem:$recovery")
                .cleanDisabled(true)
                .baselineOnMigrate(false)
                .load()
        assertThrows<FlywayException> { flyway.migrate() }
        assertThrows<FlywayException> { flyway.migrate() }
        connection().use { connection ->
            connection.createStatement().use { statement ->
                statement.executeQuery("SELECT COUNT(*) FROM recovery_marker").use { result ->
                    result.next()
                    assertThat(result.getInt(1)).isEqualTo(1)
                }
                statement.executeQuery("SELECT COUNT(*) FROM reservations").use { result ->
                    result.next()
                    assertThat(result.getInt(1)).isEqualTo(1)
                }
                statement.execute("CREATE TABLE migration_precondition (id INT PRIMARY KEY)")
            }
        }
        flyway.repair()
        assertThat(flyway.migrate().migrationsExecuted).isEqualTo(1)
        assertThat(flyway.migrate().migrationsExecuted).isZero()
        flyway.validate()
        connection().use { connection ->
            connection.createStatement().use { statement ->
                statement.executeQuery("SELECT COUNT(*) FROM recovery_marker").use { result ->
                    result.next()
                    assertThat(result.getInt(1)).isEqualTo(1)
                }
                statement
                    .executeQuery(
                        "SELECT c.last_name, r.start_date FROM reservations r JOIN customers c ON c.id=r.customer_id WHERE r.id=1"
                    )
                    .use { result ->
                        assertThat(result.next()).isTrue()
                        assertThat(result.getString(1)).isEqualTo("Гостин")
                        assertThat(result.getString(2)).isEqualTo("2026-03-28")
                    }
            }
        }
    }

    @Test
    fun guestProfileUpgradeResumesPartialDdlAndPreservesOldContactsAndBookings() {
        DatabaseMigrations.configured(database.jdbcUrl, database.username, database.password, "7")
            .migrate()
        connection().use { connection ->
            connection.createStatement().use { statement ->
                statement.executeUpdate("INSERT INTO apartments (id, capacity) VALUES (1, 2)")
                statement.executeUpdate(
                    "INSERT INTO customers (id, first_name, last_name, phone, address) VALUES (1, 'Јана', 'Гостин', '070 123-456', 'Synthetic address')"
                )
                statement.executeUpdate(
                    "INSERT INTO reservations (id, customer_id, room_id, start_date, end_date) VALUES (1, 1, 1, '2026-03-28', '2026-03-30')"
                )
                statement.execute("ALTER TABLE customers ADD COLUMN email VARCHAR(254) NULL")
                statement.execute("ALTER TABLE customers MODIFY COLUMN address VARCHAR(500) NULL")
            }
        }
        val flyway =
            DatabaseMigrations.configured(
                database.jdbcUrl,
                database.username,
                database.password,
                "8",
            )
        assertThat(flyway.migrate().migrationsExecuted).isEqualTo(1)
        assertThat(flyway.migrate().migrationsExecuted).isZero()
        connection().use { connection ->
            connection.createStatement().use { statement ->
                statement
                    .executeQuery(
                        "SELECT c.first_name,c.phone,c.address,c.active,c.version,r.start_date FROM customers c JOIN reservations r ON r.customer_id=c.id WHERE c.id=1"
                    )
                    .use { row ->
                        assertThat(row.next()).isTrue()
                        assertThat(row.getString(1)).isEqualTo("Јана")
                        assertThat(row.getString(2)).isEqualTo("070 123-456")
                        assertThat(row.getString(3)).isEqualTo("Synthetic address")
                        assertThat(row.getBoolean(4)).isTrue()
                        assertThat(row.getLong(5)).isZero()
                        assertThat(row.getString(6)).isEqualTo("2026-03-28")
                    }
                statement.executeUpdate(
                    "INSERT INTO customers (first_name,last_name) VALUES ('Walk','In')"
                )
                assertThrows<SQLException> {
                    statement.executeUpdate("UPDATE customers SET active=2 WHERE id=1")
                }
            }
        }
    }

    @Test
    fun roomDirectoryUpgradeResumesPartialDdlAndPreservesBookingsPricesAndExistingMetadata() {
        DatabaseMigrations.configured(database.jdbcUrl, database.username, database.password, "8")
            .migrate()
        connection().use { connection ->
            connection.createStatement().use { statement ->
                statement.executeUpdate(
                    "INSERT INTO apartments (id, capacity, orientation, view, regular_price) VALUES (1, 3, 'South', 'Езеро', 123)"
                )
                statement.executeUpdate(
                    "INSERT INTO customers (id,first_name,last_name) VALUES (1,'Walk','In')"
                )
                statement.executeUpdate(
                    "INSERT INTO reservations (customer_id,room_id,start_date,end_date) VALUES (1,1,'2099-01-01','2099-01-03')"
                )
                statement.execute(
                    "ALTER TABLE apartments ADD COLUMN name VARCHAR(200) NOT NULL DEFAULT 'Room', ADD COLUMN reference VARCHAR(32) NULL"
                )
                statement.executeUpdate(
                    "INSERT INTO apartments (id,capacity,name,reference) VALUES (2,2,'Custom studio','CUSTOM-2')"
                )
            }
        }
        val flyway =
            DatabaseMigrations.configured(
                database.jdbcUrl,
                database.username,
                database.password,
                "9",
            )
        assertThat(flyway.migrate().migrationsExecuted).isEqualTo(1)
        assertThat(flyway.migrate().migrationsExecuted).isZero()
        connection().use { connection ->
            connection.createStatement().use { statement ->
                statement
                    .executeQuery(
                        "SELECT a.name,a.reference,a.regular_price,r.start_date FROM apartments a JOIN reservations r ON r.room_id=a.id WHERE a.id=1"
                    )
                    .use { row ->
                        assertThat(row.next()).isTrue()
                        assertThat(row.getString(1)).isEqualTo("Езеро · South")
                        assertThat(row.getString(2)).isEqualTo("ROOM-1")
                        assertThat(row.getInt(3)).isEqualTo(123)
                        assertThat(row.getString(4)).isEqualTo("2099-01-01")
                    }
                statement.executeQuery("SELECT name FROM apartments WHERE id=2").use { row ->
                    row.next()
                    assertThat(row.getString(1)).isEqualTo("Custom studio")
                }
                assertThrows<SQLException> {
                    statement.executeUpdate("UPDATE apartments SET reference='ROOM-1' WHERE id=2")
                }
                statement.executeUpdate(
                    "INSERT INTO apartments (capacity, property_id, reference) VALUES (2,'other','ROOM-1')"
                )
            }
        }
    }
}
