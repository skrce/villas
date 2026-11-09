package com.villarosa

import java.sql.Connection
import java.sql.DriverManager
import org.assertj.core.api.Assertions.assertThat
import org.flywaydb.core.api.FlywayException
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers

@Testcontainers
class BusinessRowSecurityMigrationIT {
    @Container val database = TestDatabases.postgres()

    private fun connection(name: String = "villarosa") =
        DriverManager.getConnection(
            database.jdbcUrl.replace("/villarosa", "/$name"),
            database.username,
            database.password,
        )

    private fun migrate(target: String = "latest") =
        DatabaseMigrations.configured(
                database.jdbcUrl,
                database.username,
                database.password,
                target,
            )
            .migrate()

    private fun execute(sql: String) =
        connection().use { it.createStatement().use { statement -> statement.execute(sql) } }

    private fun scalar(sql: String) =
        connection().use {
            it.createStatement().use { statement ->
                statement.executeQuery(sql).use { rows ->
                    check(rows.next())
                    rows.getString(1)
                }
            }
        }

    private fun fingerprint(connection: Connection): Map<String, List<String>> {
        val tables =
            connection.createStatement().use {
                it.executeQuery(
                        "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name<>'flyway_schema_history' ORDER BY table_name"
                    )
                    .use { rows -> buildList { while (rows.next()) add(rows.getString(1)) } }
            }
        return tables.associateWith { table ->
            require(table.matches(Regex("[a-z_]+")))
            connection.createStatement().use {
                it.executeQuery("SELECT row_to_json(t)::TEXT FROM $table t").use { rows ->
                    buildList { while (rows.next()) add(rows.getString(1)) }.sorted()
                }
            }
        }
    }

    private fun history() {
        migrate("16")
        execute(
            requireNotNull(javaClass.getResource("/identity-history.sql"))
                .readText()
                .replace("__SECOND_SUBJECT__", "synthetic-owner")
        )
        migrate("17")
        execute(
            """
            INSERT INTO apartments(id,property_id,capacity,name,reference) VALUES(2,'lake-house',2,'Synthetic lake','R-1');
            INSERT INTO customers(id,property_id,first_name,last_name) VALUES(2,'lake-house','Synthetic lake','Guest');
            INSERT INTO reservations(id,property_id,customer_id,room_id,start_date,end_date) VALUES(2,'lake-house',2,2,'2030-01-01','2030-01-03');
            INSERT INTO booking_quotes(id,property_id,actor_id,room_id,start_date,end_date,guest_count,currency,rate_version,total_cents,price_json,created_at,expires_at)
                VALUES('quote-b','lake-house','00000000-0000-0000-0000-000000000002',2,'2030-01-01','2030-01-03',1,'EUR',0,200,'{}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP+INTERVAL '15 minutes');
            INSERT INTO reservation_prices(id,property_id,reservation_id,reservation_version,actor_id,quote_json,accepted_at)
                VALUES('quote-b','lake-house',2,0,'00000000-0000-0000-0000-000000000002','{}',CURRENT_TIMESTAMP);
            INSERT INTO ledger_entries(property_id,reservation_id,reservation_version,actor_id,operation_key,kind,currency,amount_cents,method,effective_date,recorded_at)
                VALUES('lake-house',2,0,'00000000-0000-0000-0000-000000000002','synthetic-payment','PAYMENT','EUR',200,'CASH','2030-01-01',CURRENT_TIMESTAMP);
            INSERT INTO SPRING_SESSION(PRIMARY_ID,SESSION_ID,CREATION_TIME,LAST_ACCESS_TIME,MAX_INACTIVE_INTERVAL,EXPIRY_TIME)
                VALUES('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004',1,1,259200,9999999999999);
            INSERT INTO SPRING_SESSION_ATTRIBUTES VALUES('00000000-0000-0000-0000-000000000003','synthetic-context',decode('ABCD','hex'));
            """
                .trimIndent()
        )
    }

    @Test
    fun upgradeRetainsEveryRowAndSessionRemovesTenantDefaultsAndEnablesAllPolicies() {
        history()
        val before = connection().use(::fingerprint)
        assertThat(migrate().migrationsExecuted).isEqualTo(1)
        assertThat(connection().use(::fingerprint)).isEqualTo(before)
        assertThat(
                scalar(
                    "SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity"
                )
            )
            .isEqualTo("23")
        assertThat(
                scalar(
                    "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND column_name='property_id' AND column_default IS NOT NULL"
                )
            )
            .isEqualTo("0")
        assertThat(
                scalar(
                    "SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'villas_%' AND p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog, pg_temp']"
                )
            )
            .isEqualTo("4")
        assertThat(
                scalar(
                    "SELECT COUNT(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.proname LIKE 'villas_%' AND a.grantee=0 AND a.privilege_type='EXECUTE'"
                )
            )
            .isEqualTo("0")
        assertThat(migrate().migrationsExecuted).isZero()
        assertThat(connection().use(::fingerprint)).isEqualTo(before)
    }

    @Test
    fun anInactiveLegacyBusinessCanUpgradeWithoutBeingReenabledOrChangingItsRecords() {
        history()
        execute("UPDATE businesses SET active=FALSE WHERE id='villa-rosa'")
        val before = connection().use(::fingerprint)
        assertThat(
                DatabaseMigrations.migrate(database.jdbcUrl, database.username, database.password)
                    .migrationsExecuted
            )
            .isEqualTo(1)
        assertThat(connection().use(::fingerprint)).isEqualTo(before)
        connection().use(PropertyDatabaseBinding::verify)
    }

    @Test
    fun failedPolicyCreationRollsBackAllFunctionsPoliciesDefaultsAndHistoryBeforeRetry() {
        history()
        val before = connection().use(::fingerprint)
        execute(
            "CREATE FUNCTION fail_s3_policy() RETURNS event_trigger LANGUAGE plpgsql AS 'BEGIN RAISE EXCEPTION ''synthetic policy failure''; END'; CREATE EVENT TRIGGER reject_s3_policy ON ddl_command_start WHEN TAG IN ('ALTER POLICY') EXECUTE FUNCTION fail_s3_policy()"
        )
        assertThrows<FlywayException> { migrate() }
        assertThat(scalar("SELECT MAX(version::INT) FROM flyway_schema_history")).isEqualTo("17")
        assertThat(scalar("SELECT COUNT(*) FROM pg_proc WHERE proname LIKE 'villas_%'"))
            .isEqualTo("0")
        assertThat(scalar("SELECT COUNT(*) FROM pg_class WHERE relrowsecurity")).isEqualTo("0")
        assertThat(connection().use(::fingerprint)).isEqualTo(before)
        execute("DROP EVENT TRIGGER reject_s3_policy; DROP FUNCTION fail_s3_policy()")
        assertThat(migrate().migrationsExecuted).isEqualTo(1)
        assertThat(migrate().migrationsExecuted).isZero()
        assertThat(connection().use(::fingerprint)).isEqualTo(before)
    }

    @Test
    fun unqualifiedBackupFailsClosedAndAReadOnlyBypassRoleRestoresBothBusinesses() {
        history()
        migrate()
        val before = connection().use(::fingerprint)
        execute(
            "CREATE ROLE villas_backup LOGIN PASSWORD 'synthetic-backup' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO villas_backup; GRANT SELECT ON ALL TABLES IN SCHEMA public TO villas_backup; GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO villas_backup"
        )
        fun dump() =
            database.execInContainer(
                "env",
                "PGPASSWORD=synthetic-backup",
                "pg_dump",
                "--host=127.0.0.1",
                "--username=villas_backup",
                "--dbname=villarosa",
                "--schema=public",
                "--format=custom",
                "--no-owner",
                "--no-acl",
                "--file=/tmp/businesses.dump",
            )
        assertThat(dump().exitCode).isNotZero()
        execute("ALTER ROLE villas_backup BYPASSRLS")
        DriverManager.getConnection(database.jdbcUrl, "villas_backup", "synthetic-backup").use {
            connection ->
            connection.createStatement().use { sql ->
                sql.executeQuery("SELECT COUNT(DISTINCT property_id) FROM customers").use { rows ->
                    rows.next()
                    assertThat(rows.getInt(1)).isEqualTo(2)
                }
                assertThrows<java.sql.SQLException> {
                    sql.executeUpdate("DELETE FROM customers WHERE property_id='villa-rosa'")
                }
                assertThrows<java.sql.SQLException> { sql.execute("SET ROLE villas_test") }
            }
        }
        assertThat(dump().exitCode).isZero()
        execute("CREATE DATABASE s3_restore TEMPLATE template0")
        val restored =
            database.execInContainer(
                "env",
                "PGPASSWORD=${database.password}",
                "pg_restore",
                "--host=127.0.0.1",
                "--username=${database.username}",
                "--dbname=s3_restore",
                "--clean",
                "--if-exists",
                "--no-owner",
                "--no-acl",
                "--single-transaction",
                "--exit-on-error",
                "/tmp/businesses.dump",
            )
        assertThat(restored.exitCode).withFailMessage(restored.stderr).isZero()
        connection("s3_restore").use { assertThat(fingerprint(it)).isEqualTo(before) }
    }
}
