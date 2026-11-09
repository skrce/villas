package com.villarosa

import org.flywaydb.core.Flyway
import org.flywaydb.core.api.output.MigrateResult

object DatabaseMigrations {
    fun configured(
        url: String,
        username: String,
        password: String,
        target: String = "latest",
    ): Flyway =
        Flyway.configure()
            .dataSource(url, username, password)
            .locations("classpath:db/postgresql")
            .placeholders(mapOf("propertyId" to com.villarosa.service.PropertyScope.ID))
            .target(target)
            .cleanDisabled(true)
            .baselineOnMigrate(false)
            .outOfOrder(false)
            .validateMigrationNaming(true)
            .load()

    fun migrate(url: String, username: String, password: String): MigrateResult {
        java.sql.DriverManager.getConnection(url, username, password).use { connection ->
            val bound =
                connection.metaData
                    .getTables(null, "public", "property_identity", arrayOf("TABLE"))
                    .use { it.next() }
            if (bound) PropertyDatabaseBinding.verify(connection)
        }
        return configured(url, username, password).migrate().also {
            java.sql.DriverManager.getConnection(url, username, password).use {
                PropertyDatabaseBinding.verify(it)
            }
        }
    }

    fun fromEnvironment() {
        val settings = PrivateSettings.resolve()
        fun required(name: String) =
            settings[name]?.takeIf { it.isNotBlank() }
                ?: error("Migration setting $name is required.")
        val result =
            migrate(
                required("VILLAS_DB_URL"),
                required("VILLAS_DB_USERNAME"),
                required("VILLAS_DB_PASSWORD"),
            )
        if (System.getenv("VILLAS_CLOUD_RUN") == "1")
            grantRuntime(
                required("VILLAS_DB_URL"),
                required("VILLAS_DB_USERNAME"),
                required("VILLAS_DB_PASSWORD"),
            )
        println(
            "Villas schema migration completed: ${result.migrationsExecuted} migrations applied."
        )
    }

    fun check(url: String, username: String, password: String) {
        val flyway = configured(url, username, password)
        flyway.validate()
        require(flyway.info().pending().isEmpty() && flyway.info().applied().isNotEmpty()) {
            "The database must match the complete bundled schema."
        }
        java.sql.DriverManager.getConnection(url, username, password).use {
            PropertyDatabaseBinding.verify(it)
        }
    }

    fun grantRuntime(url: String, username: String, password: String) {
        val sql =
            requireNotNull(
                    DatabaseMigrations::class.java.getResource("/release/runtime-grants.sql")
                )
                .readText()
        java.sql.DriverManager.getConnection(url, username, password).use { connection ->
            connection.autoCommit = false
            try {
                connection.createStatement().use { it.execute(sql) }
                connection.commit()
            } catch (failure: Exception) {
                connection.rollback()
                throw failure
            }
        }
    }
}
