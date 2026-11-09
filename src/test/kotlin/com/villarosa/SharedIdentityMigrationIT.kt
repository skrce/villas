package com.villarosa

import java.sql.DriverManager
import org.assertj.core.api.Assertions.assertThat
import org.flywaydb.core.api.FlywayException
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers

@Testcontainers
class SharedIdentityMigrationIT {
    @Container val database = TestDatabases.postgres()

    private fun connection() =
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password)

    private fun migrate(target: String = "17") =
        DatabaseMigrations.configured(
                database.jdbcUrl,
                database.username,
                database.password,
                target,
            )
            .migrate()

    private fun execute(sql: String) =
        connection().use { it.createStatement().use { statement -> statement.execute(sql) } }

    private fun scalar(sql: String): String? =
        connection().use {
            it.createStatement().use { statement ->
                statement.executeQuery(sql).use { rows ->
                    check(rows.next())
                    rows.getString(1)
                }
            }
        }

    private fun fingerprint(tables: Set<String>? = null): Map<String, List<String>> =
        connection().use { connection ->
            val names =
                tables
                    ?: connection.createStatement().use { statement ->
                        statement
                            .executeQuery(
                                "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name NOT IN ('flyway_schema_history','spring_session','spring_session_attributes')"
                            )
                            .use { rows -> buildSet { while (rows.next()) add(rows.getString(1)) } }
                    }
            names.associateWith { table ->
                require(table.matches(Regex("[a-z_]+")))
                connection.createStatement().use { statement ->
                    statement
                        .executeQuery(
                            if (table == "businesses")
                                "SELECT (to_jsonb(t)-'lock_token')::text FROM $table t"
                            else "SELECT row_to_json(t)::text FROM $table t"
                        )
                        .use { rows ->
                            buildList { while (rows.next()) add(rows.getString(1)) }.sorted()
                        }
                }
            }
        }

    private fun seed(sameSubject: Boolean = true) {
        val second = if (sameSubject) "synthetic-owner" else "different-subject"
        execute(
            requireNotNull(javaClass.getResource("/identity-history.sql"))
                .readText()
                .replace("__SECOND_SUBJECT__", second)
        )
    }

    @ParameterizedTest
    @ValueSource(booleans = [false, true])
    fun backfillGroupsOnlyProviderIdentityPreservesEveryMembershipAndHistoryRowAndPurgesOldSessions(
        sameSubject: Boolean
    ) {
        migrate("16")
        seed(sameSubject)
        val before = fingerprint()
        assertThat(migrate().migrationsExecuted).isEqualTo(1)
        assertThat(fingerprint(before.keys)).isEqualTo(before)
        assertThat(scalar("SELECT COUNT(*) FROM staff_identities"))
            .isEqualTo(if (sameSubject) "1" else "2")
        assertThat(scalar("SELECT id FROM staff_identities WHERE subject='synthetic-owner'"))
            .isEqualTo("00000000-0000-0000-0000-000000000001")
        assertThat(
                scalar("SELECT COUNT(*) FROM businesses WHERE lock_token<>0 OR lock_token IS NULL")
            )
            .isEqualTo("0")
        assertThat(scalar("SELECT COUNT(*) FROM spring_session")).isEqualTo("0")
        assertThat(scalar("SELECT COUNT(*) FROM spring_session_attributes")).isEqualTo("0")
        assertThat(migrate().migrationsExecuted).isZero()
        assertThat(fingerprint(before.keys)).isEqualTo(before)
        assertThrows<java.sql.SQLException> {
            execute(
                "INSERT INTO staff_accounts(id,property_id,issuer,subject,email,created_at) VALUES('unbound','villa-rosa','https://accounts.google.com','unbound','unbound@example.test',CURRENT_TIMESTAMP(6))"
            )
        }
    }

    @Test
    fun failedSessionPurgeRollsBackNewIdentityTablesConstraintsAndSessionDeletionBeforeRetry() {
        migrate("16")
        seed()
        val before = fingerprint()
        execute(
            "CREATE FUNCTION reject_session_purge() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RAISE EXCEPTION 'Synthetic purge failure'; END \$\$; CREATE TRIGGER reject_session_purge BEFORE DELETE ON spring_session FOR EACH ROW EXECUTE FUNCTION reject_session_purge()"
        )
        assertThrows<FlywayException> { migrate() }
        assertThat(scalar("SELECT to_regclass('public.staff_identities')::text")).isNull()
        assertThat(scalar("SELECT to_regclass('public.business_onboarding')::text")).isNull()
        assertThat(scalar("SELECT COUNT(*) FROM pg_constraint WHERE conname='membership_identity'"))
            .isEqualTo("0")
        assertThat(scalar("SELECT COUNT(*) FROM spring_session_attributes")).isEqualTo("1")
        assertThat(scalar("SELECT MAX(version::integer) FROM flyway_schema_history"))
            .isEqualTo("16")
        assertThat(fingerprint()).isEqualTo(before)
        execute(
            "DROP TRIGGER reject_session_purge ON spring_session; DROP FUNCTION reject_session_purge()"
        )
        assertThat(migrate().migrationsExecuted).isEqualTo(1)
        assertThat(migrate().migrationsExecuted).isZero()
        assertThat(fingerprint(before.keys)).isEqualTo(before)
    }
}
