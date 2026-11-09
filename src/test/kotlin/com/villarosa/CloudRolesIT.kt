package com.villarosa

import java.sql.DriverManager
import java.sql.SQLException
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers

@Testcontainers
class CloudRolesIT {
    @Container val database = TestDatabases.postgres()

    private fun administrator() =
        DriverManager.getConnection(database.jdbcUrl, "neon_operator", "synthetic-operator")

    private fun roles() {
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use {
            it.createStatement().use { sql ->
                sql.execute(
                    "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='neon_operator') THEN CREATE ROLE neon_operator LOGIN CREATEROLE PASSWORD 'synthetic-operator'; END IF; END $$; ALTER DATABASE villarosa OWNER TO neon_operator; ALTER SCHEMA public OWNER TO neon_operator"
                )
            }
        }
        val script =
            requireNotNull(javaClass.getResource("/deploy/cloud/neon-roles.sql"))
                .readText()
                .lineSequence()
                .filterNot { it.startsWith("\\") }
                .joinToString("\n")
        administrator().use {
            it.createStatement().use { sql ->
                sql.execute(script)
                sql.execute("ALTER ROLE villas_migration PASSWORD 'synthetic-migration'")
            }
        }
    }

    @Test
    fun sqlCreatedRolesCanMigrateThenRunAndBackUpWithoutInheritedAdministrativePermissions() {
        roles()
        roles()
        administrator().use {
            it.createStatement().use { sql ->
                sql.executeQuery("SELECT rolsuper FROM pg_roles WHERE rolname=current_user").use {
                    rows ->
                    rows.next()
                    assertThat(rows.getBoolean(1)).isFalse()
                }
                for (role in listOf("villas_migration", "villas_runtime", "villas_backup")) sql
                    .execute("ALTER ROLE $role PASSWORD 'synthetic-role-password'")
            }
        }
        DatabaseMigrations.migrate(database.jdbcUrl, "villas_migration", "synthetic-role-password")
        DatabaseMigrations.grantRuntime(
            database.jdbcUrl,
            "villas_migration",
            "synthetic-role-password",
        )
        DatabaseMigrations.check(database.jdbcUrl, "villas_runtime", "synthetic-role-password")
        DriverManager.getConnection(database.jdbcUrl, "villas_runtime", "synthetic-role-password")
            .use {
                it.createStatement().use { sql ->
                    sql.executeQuery("SELECT property_id FROM staff_property_lock FOR UPDATE")
                        .use { rows -> assertThat(rows.next()).isTrue() }
                    assertThrows<SQLException> { sql.execute("CREATE TABLE forbidden(id INTEGER)") }
                    assertThrows<SQLException> {
                        sql.execute("INSERT INTO businesses(id,name) VALUES('foreign','Synthetic')")
                    }
                    assertThrows<SQLException> {
                        sql.executeUpdate(
                            "UPDATE businesses SET name='Changed' WHERE id='villa-rosa'"
                        )
                    }
                    assertThrows<SQLException> {
                        sql.executeUpdate(
                            "UPDATE property_identity SET property_id='foreign' WHERE singleton=1"
                        )
                    }
                    assertThrows<SQLException> {
                        sql.executeUpdate(
                            "UPDATE staff_property_lock SET property_id='foreign' WHERE property_id='villa-rosa'"
                        )
                    }
                }
            }
        DriverManager.getConnection(database.jdbcUrl, "villas_backup", "synthetic-role-password")
            .use {
                it.createStatement().use { sql ->
                    sql.executeQuery("SELECT COUNT(*) FROM flyway_schema_history").use { rows ->
                        rows.next()
                        assertThat(rows.getInt(1)).isEqualTo(16)
                    }
                    assertThrows<SQLException> {
                        sql.executeUpdate("DELETE FROM customers WHERE id=1")
                    }
                }
            }
    }

    @Test
    fun provisionerRefusesRolesWithAdministrativeMembershipInsteadOfReusingThem() {
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use {
            it.createStatement().use { sql ->
                sql.execute(
                    "CREATE ROLE neon_admin; CREATE ROLE villas_runtime LOGIN; GRANT neon_admin TO villas_runtime"
                )
            }
        }
        assertThrows<SQLException> { roles() }
    }

    @Test
    fun maintenanceFencesAndTerminatesRuntimeConnectionsOnlyAfterCheckingTheBusinessBinding() {
        roles()
        DatabaseMigrations.migrate(database.jdbcUrl, "villas_migration", "synthetic-migration")
        fun execute(name: String, business: String) {
            val script =
                requireNotNull(javaClass.getResource("/deploy/cloud/$name.sql"))
                    .readText()
                    .lineSequence()
                    .filterNot { it.startsWith("\\") }
                    .joinToString("\n")
                    .replace(":'business_id'", "'$business'")
            administrator().use {
                it.createStatement().use { sql -> sql.execute(script) }
            }
        }
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use {
            it.createStatement().use { sql ->
                sql.execute("ALTER ROLE villas_runtime PASSWORD 'synthetic-runtime'")
            }
        }
        DriverManager.getConnection(database.jdbcUrl, "villas_runtime", "synthetic-runtime").use {
            runtime ->
            assertThrows<SQLException> { execute("pause-writes", "other-business") }
            runtime.createStatement().use { assertThat(it.execute("SELECT 1")).isTrue() }
            execute("pause-writes", "villa-rosa")
            assertThrows<SQLException> { runtime.createStatement().execute("SELECT 1") }
        }
        assertThrows<SQLException> {
            DriverManager.getConnection(database.jdbcUrl, "villas_runtime", "synthetic-runtime")
        }
        execute("resume-writes", "villa-rosa")
        DriverManager.getConnection(database.jdbcUrl, "villas_runtime", "synthetic-runtime").use {
            runtime ->
            runtime.createStatement().use { assertThat(it.execute("SELECT 1")).isTrue() }
        }
    }
}
