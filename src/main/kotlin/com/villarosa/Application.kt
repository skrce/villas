package com.villarosa

import com.villarosa.security.OwnerBootstrap
import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication class Application

fun main(args: Array<String>) {
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
    runApplication<Application>(*args)
}
