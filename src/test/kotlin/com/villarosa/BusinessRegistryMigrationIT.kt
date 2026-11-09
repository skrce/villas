package com.villarosa

import java.sql.Connection
import java.sql.DriverManager
import java.sql.SQLException
import org.assertj.core.api.Assertions.assertThat
import org.flywaydb.core.api.FlywayException
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.postgresql.util.PSQLException
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers

@Testcontainers
class BusinessRegistryMigrationIT {
    @Container val database = TestDatabases.postgres()

    private fun connection(): Connection =
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password)

    private fun migrate(target: String = "latest", name: String = "Villa Rosa") =
        DatabaseMigrations.configured(
                database.jdbcUrl,
                database.username,
                database.password,
                target,
                propertyName = name,
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

    private fun fingerprint(): Map<String, List<String>> =
        connection().use { connection ->
            val tables =
                connection.createStatement().use { statement ->
                    statement
                        .executeQuery(
                            "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name NOT IN ('flyway_schema_history','businesses') ORDER BY table_name"
                        )
                        .use { rows ->
                            buildList { while (rows.next()) add(rows.getString(1)) }
                        }
                }
            tables.associateWith { table ->
                require(table.matches(Regex("[a-z_]+")))
                connection.createStatement().use { statement ->
                    statement.executeQuery("SELECT row_to_json(t)::text FROM $table t").use { rows
                        ->
                        buildList { while (rows.next()) add(rows.getString(1)) }.sorted()
                    }
                }
            }
        }

    private fun seedGraph() {
        execute(
            """
            INSERT INTO staff_accounts(id,property_id,issuer,subject,email,created_at) VALUES('owner-a','villa-rosa','https://accounts.google.com','synthetic-a','owner-a@example.test',CURRENT_TIMESTAMP(6));
            INSERT INTO apartments(id,property_id,capacity,name,reference) VALUES(1,'villa-rosa',2,'Езеро','R-1');
            INSERT INTO customers(id,property_id,first_name,last_name) VALUES(1,'villa-rosa','Synthetic','Гостин');
            INSERT INTO reservations(id,property_id,customer_id,room_id,start_date,end_date) VALUES(1,'villa-rosa',1,1,'2030-01-01','2030-01-03');
            INSERT INTO booking_quotes(id,property_id,actor_id,room_id,start_date,end_date,guest_count,currency,rate_version,total_cents,price_json,created_at,expires_at) VALUES('quote-a','villa-rosa','owner-a',1,'2030-01-01','2030-01-03',1,'EUR',0,100,'{}',CURRENT_TIMESTAMP(6),CURRENT_TIMESTAMP(6)+INTERVAL '15 minutes');
            INSERT INTO reservation_prices(id,property_id,reservation_id,reservation_version,actor_id,quote_json,accepted_at) VALUES('quote-a','villa-rosa',1,0,'owner-a','{}',CURRENT_TIMESTAMP(6));
            INSERT INTO readiness_events(property_id,room_id,actor_id,operation_key,resource_version,previous_state,state,occurred_at) VALUES('villa-rosa',1,'owner-a','synthetic-readiness',1,'DIRTY','CLEAN',CURRENT_TIMESTAMP(6));
            INSERT INTO ledger_entries(property_id,reservation_id,reservation_version,actor_id,operation_key,kind,currency,amount_cents,method,effective_date,recorded_at) VALUES('villa-rosa',1,0,'owner-a','synthetic-payment','PAYMENT','EUR',100,'CASH','2030-01-01',CURRENT_TIMESTAMP(6));
            INSERT INTO business_events(property_id,actor_id,kind,subject_type,subject_id,occurred_at) VALUES('villa-rosa','owner-a','SYNTHETIC','GUEST','1',CURRENT_TIMESTAMP(6));
            """
                .trimIndent()
        )
    }

    @Test
    fun v15UpgradePreservesEveryExistingRowAndSeedsTheQuotedUnicodeBusinessNameOnlyOnce() {
        migrate("15")
        seedGraph()
        val before = fingerprint()
        val name = "Охрид O'Neil \\ House"
        assertThat(migrate(name = name).migrationsExecuted).isEqualTo(1)
        assertThat(fingerprint()).isEqualTo(before)
        assertThat(scalar("SELECT name FROM businesses WHERE id='villa-rosa'")).isEqualTo(name)
        assertThat(migrate(name = "Different environment label").migrationsExecuted).isZero()
        assertThat(scalar("SELECT name FROM businesses WHERE id='villa-rosa'")).isEqualTo(name)
        assertThat(fingerprint()).isEqualTo(before)
    }

    @Test
    fun registryNamesCannotTurnIntoMigrationSql() {
        val name = "Synthetic \\'; DROP TABLE customers; --"
        migrate(name = name)
        assertThat(scalar("SELECT name FROM businesses WHERE id='villa-rosa'")).isEqualTo(name)
        assertThat(scalar("SELECT COUNT(*) FROM customers")).isEqualTo("0")
    }

    @Test
    fun allBusinessOwnedTablesRequireARegisteredBusinessAndCannotDeleteItsHistory() {
        migrate()
        assertThat(
                scalar(
                    """
                    SELECT COUNT(*) FROM pg_attribute a
                    JOIN pg_class t ON t.oid=a.attrelid
                    JOIN pg_namespace n ON n.oid=t.relnamespace
                    WHERE n.nspname='public' AND t.relkind IN ('r','p') AND a.attname='property_id'
                      AND NOT EXISTS (
                        SELECT FROM pg_constraint c WHERE c.conrelid=t.oid
                          AND c.contype='f' AND c.confrelid='businesses'::regclass
                          AND c.conkey=ARRAY[a.attnum]
                      )
                    """
                        .trimIndent()
                )
            )
            .isEqualTo("0")
        assertThrows<SQLException> {
            execute("INSERT INTO apartments(property_id,capacity) VALUES('unregistered',2)")
        }
        execute("INSERT INTO businesses(id,name) VALUES('lake-house','Lake House')")
        execute("INSERT INTO apartments(property_id,capacity) VALUES('lake-house',2)")
        assertThrows<SQLException> { execute("DELETE FROM businesses WHERE id='lake-house'") }
        assertThat(scalar("SELECT COUNT(*) FROM businesses")).isEqualTo("2")
        assertThat(scalar("SELECT COUNT(*) FROM apartments WHERE property_id='lake-house'"))
            .isEqualTo("1")
    }

    @Test
    fun quotesPricesReadinessAndMoneyCannotAttributeAnActionToAnotherBusinessOwner() {
        migrate()
        seedGraph()
        execute("INSERT INTO businesses(id,name) VALUES('lake-house','Lake House')")
        execute(
            "INSERT INTO staff_accounts(id,property_id,issuer,subject,email,created_at) VALUES('owner-b','lake-house','https://accounts.google.com','synthetic-b','owner-b@example.test',CURRENT_TIMESTAMP(6))"
        )
        val before = fingerprint()
        for ((table, constraint) in
            mapOf(
                "booking_quotes" to "quote_owner",
                "reservation_prices" to "price_owner",
                "readiness_events" to "readiness_event_actor",
                "ledger_entries" to "ledger_actor",
            )) {
            val error =
                assertThrows<PSQLException> {
                    execute("UPDATE $table SET actor_id='owner-b' WHERE property_id='villa-rosa'")
                }
            assertThat(error.sqlState).isEqualTo("23503")
            assertThat(error.serverErrorMessage?.constraint).isEqualTo(constraint)
        }
        assertThat(fingerprint()).isEqualTo(before)
    }

    @Test
    fun unknownLegacyBusinessDataRefusesTheUpgradeAndRollsBackAllDdlWithoutRepair() {
        migrate("15")
        seedGraph()
        execute(
            "INSERT INTO customers(id,property_id,first_name,last_name) VALUES(99,'unregistered','Synthetic','Foreign')"
        )
        val before = fingerprint()
        assertThrows<FlywayException> { migrate() }
        assertThat(scalar("SELECT to_regclass('public.businesses')::text")).isNull()
        assertThat(scalar("SELECT MAX(version::integer) FROM flyway_schema_history"))
            .isEqualTo("15")
        assertThat(fingerprint()).isEqualTo(before)
        execute("DELETE FROM customers WHERE id=99 AND property_id='unregistered'")
        assertThat(migrate().migrationsExecuted).isEqualTo(1)
        assertThat(migrate().migrationsExecuted).isZero()
    }

    @Test
    fun legacyDatabaseCannotStartTheApplicationButCanRunTheExplicitUpgrade() {
        migrate("15")
        val source =
            org.springframework.jdbc.datasource.DriverManagerDataSource(
                database.jdbcUrl,
                database.username,
                database.password,
            )
        assertThrows<IllegalArgumentException> { PropertyDatabaseBinding(source) }
        assertThat(
                DatabaseMigrations.migrate(database.jdbcUrl, database.username, database.password)
                    .migrationsExecuted
            )
            .isEqualTo(1)
        PropertyDatabaseBinding(source)
    }

    @Test
    fun businessRegistryValidatesInitialMarketSettingsAndInactiveBusinessCannotStart() {
        migrate()
        connection().use(PropertyDatabaseBinding::verify)
        for (sql in
            listOf(
                "INSERT INTO businesses(id,name) VALUES('Invalid ID','Synthetic')",
                "INSERT INTO businesses(id,name) VALUES('blank','  ')",
                "INSERT INTO businesses(id,name) VALUES('control',E'Synthetic\\nName')",
                "INSERT INTO businesses(id,name,currency) VALUES('currency','Synthetic','USD')",
                "INSERT INTO businesses(id,name,property_timezone) VALUES('timezone','Synthetic','UTC')",
            )) assertThrows<SQLException> { execute(sql) }
        execute("UPDATE businesses SET active=FALSE WHERE id='villa-rosa'")
        assertThrows<IllegalArgumentException> { connection().use(PropertyDatabaseBinding::verify) }
    }
}
