package com.villarosa

import com.villarosa.security.OwnerBootstrap
import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication class Application

fun main(args: Array<String>) {
    (org.slf4j.LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME)
            as? ch.qos.logback.classic.Logger)
        ?.level = ch.qos.logback.classic.Level.OFF
    try {
        execute(args)
    } catch (_: Exception) {
        System.err.println(
            "Villas command failed. Check the private configuration, migration history and health status before retrying."
        )
        kotlin.system.exitProcess(1)
    }
}

private fun execute(args: Array<String>) {
    PrivateSettings.install()
    if (args.contentEquals(arrayOf("healthcheck"))) {
        kotlin.system.exitProcess(HealthProbe.check())
    }
    if (args.contentEquals(arrayOf("recover-owner"))) {
        OwnerBootstrap.run(false, recovery = true)
        return
    }
    if (args.firstOrNull() == "bootstrap-owner") {
        require(args.size == 1 || (args.size == 2 && args[1] == "--replace-pending")) {
            "Use bootstrap-owner with an optional --replace-pending flag."
        }
        OwnerBootstrap.run(args.size == 2)
        return
    }
    if (args.contentEquals(arrayOf("migrate"))) {
        DatabaseMigrations.fromEnvironment()
        return
    }
    if (args.contentEquals(arrayOf("check-schema"))) {
        val settings = PrivateSettings.resolve()
        DatabaseMigrations.check(
            settings.getValue("VILLAS_DB_URL"),
            settings.getValue("VILLAS_DB_USERNAME"),
            settings.getValue("VILLAS_DB_PASSWORD"),
        )
        println("Villas schema and business binding verified.")
        return
    }
    runApplication<Application>(*args)
}
