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

    fun migrate(url: String, username: String, password: String): MigrateResult =
        configured(url, username, password).migrate().also {
            java.sql.DriverManager.getConnection(url, username, password).use {
                PropertyDatabaseBinding.verify(it)
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
        println(
            "Villas schema migration completed: ${result.migrationsExecuted} migrations applied."
        )
    }
}
