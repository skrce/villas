package com.villarosa

import java.sql.DriverManager
import java.sql.SQLException
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers

@Testcontainers
class RecoveryMigrationIT {
    @Container val database = TestDatabases.postgres()

    private fun connection() =
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password)

    private val snapshot = "a".repeat(64)

    @ParameterizedTest
    @ValueSource(booleans = [false, true])
    fun recoveryMigrationResumesWithoutChangingExistingBusinessRecords(partial: Boolean) {
        DatabaseMigrations.configured(database.jdbcUrl, database.username, database.password, "14")
            .migrate()
        connection().use { connection ->
            connection.createStatement().use { sql ->
                sql.executeUpdate(
                    "INSERT INTO apartments(id,capacity,name,reference) VALUES(1,2,'Езеро','R-1')"
                )
                sql.executeUpdate(
                    "INSERT INTO customers(id,first_name,last_name) VALUES(1,'Synthetic','Guest')"
                )
                sql.executeUpdate(
                    "INSERT INTO reservations(id,customer_id,room_id,start_date,end_date) VALUES(1,1,1,'2030-01-01','2030-01-03')"
                )
                if (partial)
                    sql.execute(
                        checkNotNull(
                                javaClass.getResource("/db/postgresql/V15__recovery_audit.sql")
                            )
                            .readText()
                    )
            }
        }
        val flyway =
            DatabaseMigrations.configured(database.jdbcUrl, database.username, database.password)
        assertThat(flyway.migrate().migrationsExecuted).isEqualTo(1)
        assertThat(flyway.migrate().migrationsExecuted).isZero()
        flyway.validate()
        connection().use { connection ->
            connection.createStatement().use { sql ->
                sql.executeQuery(
                        "SELECT a.name,c.last_name,r.start_date FROM reservations r JOIN apartments a ON a.id=r.room_id JOIN customers c ON c.id=r.customer_id WHERE r.id=1"
                    )
                    .use { row ->
                        assertThat(row.next()).isTrue()
                        assertThat(row.getString(1)).isEqualTo("Езеро")
                        assertThat(row.getString(2)).isEqualTo("Guest")
                        assertThat(row.getString(3)).isEqualTo("2030-01-01")
                    }
            }
        }
    }

    private fun seed(version: Long) {
        DatabaseMigrations.migrate(database.jdbcUrl, database.username, database.password)
        connection().use { connection ->
            connection.createStatement().use { sql ->
                sql.executeUpdate(
                    "INSERT INTO staff_accounts(id,property_id,issuer,subject,email,security_version,created_at) VALUES('00000000-0000-0000-0000-000000000001','villa-rosa','https://accounts.google.com','synthetic-owner','owner@example.test',$version,CURRENT_TIMESTAMP(6))"
                )
                sql.executeUpdate(
                    "INSERT INTO SPRING_SESSION(PRIMARY_ID,SESSION_ID,CREATION_TIME,LAST_ACCESS_TIME,MAX_INACTIVE_INTERVAL,EXPIRY_TIME) VALUES('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',1,1,259200,9999999999999)"
                )
                sql.executeUpdate(
                    "INSERT INTO SPRING_SESSION_ATTRIBUTES VALUES('00000000-0000-0000-0000-000000000001','synthetic-context',decode('ABCD','hex'))"
                )
            }
        }
    }

    private fun quarantine() =
        checkNotNull(javaClass.getResource("/deploy/recovery-quarantine.sql"))
            .readText()
            .replace("__SNAPSHOT_ID__", snapshot)
            .split(';')
            .map(String::trim)
            .filter(String::isNotEmpty)

    @Test
    fun quarantineUsesTheRestoredBusinessBindingForRevocationAndAudit() {
        seed(7)
        connection().use { connection ->
            connection.createStatement().use { sql ->
                sql.executeUpdate(
                    "UPDATE property_identity SET property_id='lake-house' WHERE singleton=1"
                )
                sql.executeUpdate(
                    "UPDATE staff_accounts SET property_id='lake-house' WHERE property_id='villa-rosa'"
                )
                quarantine().forEach { sql.execute(it) }
                sql.executeQuery(
                        "SELECT property_id,changed_staff FROM recovery_events WHERE snapshot_id='$snapshot'"
                    )
                    .use { rows ->
                        assertThat(rows.next()).isTrue()
                        assertThat(rows.getString(1)).isEqualTo("lake-house")
                        assertThat(rows.getLong(2)).isEqualTo(1)
                    }
                sql.executeQuery(
                        "SELECT security_version FROM staff_accounts WHERE property_id='lake-house'"
                    )
                    .use { rows ->
                        assertThat(rows.next()).isTrue()
                        assertThat(rows.getLong(1)).isEqualTo(8)
                    }
                sql.executeQuery("SELECT COUNT(*) FROM SPRING_SESSION").use { rows ->
                    rows.next()
                    assertThat(rows.getLong(1)).isZero()
                }
            }
        }
    }

    @Test
    fun quarantineRevokesSessionsAndStaffGenerationsWithAnAtomicRecoveryEvent() {
        seed(7)
        connection().use { connection ->
            connection.createStatement().use { sql -> quarantine().forEach { sql.execute(it) } }
        }
        connection().use { connection ->
            connection.createStatement().use { sql ->
                sql.executeQuery(
                        "SELECT (SELECT COUNT(*) FROM SPRING_SESSION),(SELECT COUNT(*) FROM SPRING_SESSION_ATTRIBUTES),(SELECT security_version FROM staff_accounts LIMIT 1),snapshot_id,invalidated_sessions,changed_staff FROM recovery_events"
                    )
                    .use { row ->
                        assertThat(row.next()).isTrue()
                        assertThat(row.getInt(1)).isZero()
                        assertThat(row.getInt(2)).isZero()
                        assertThat(row.getLong(3)).isEqualTo(8)
                        assertThat(row.getString(4)).isEqualTo(snapshot)
                        assertThat(row.getLong(5)).isEqualTo(1)
                        assertThat(row.getLong(6)).isEqualTo(1)
                    }
            }
        }
    }

    @Test
    fun failedGenerationChangeRollsBackSessionDeletionAndRecoveryAudit() {
        seed(Long.MAX_VALUE)
        connection().use { connection ->
            connection.createStatement().use { sql ->
                assertThrows<SQLException> { quarantine().forEach { sql.execute(it) } }
            }
        }
        connection().use { connection ->
            connection.createStatement().use { sql ->
                sql.executeQuery(
                        "SELECT (SELECT COUNT(*) FROM SPRING_SESSION),(SELECT COUNT(*) FROM SPRING_SESSION_ATTRIBUTES),(SELECT COUNT(*) FROM recovery_events),(SELECT security_version FROM staff_accounts LIMIT 1)"
                    )
                    .use { row ->
                        assertThat(row.next()).isTrue()
                        assertThat(row.getInt(1)).isEqualTo(1)
                        assertThat(row.getInt(2)).isEqualTo(1)
                        assertThat(row.getInt(3)).isZero()
                        assertThat(row.getLong(4)).isEqualTo(Long.MAX_VALUE)
                    }
            }
        }
    }
}
