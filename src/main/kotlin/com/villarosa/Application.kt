package com.villarosa

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication class Application

fun main(args: Array<String>) {
    if (args.contentEquals(arrayOf("migrate"))) {
        DatabaseMigrations.fromEnvironment()
        return
    }
    runApplication<Application>(*args)
}
