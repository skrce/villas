package com.villarosa.security

import com.villarosa.Application
import org.springframework.boot.WebApplicationType
import org.springframework.boot.builder.SpringApplicationBuilder

object OwnerBootstrap {
    fun run(replacePending: Boolean) {
        val email =
            System.getenv("VILLAS_INITIAL_OWNER_EMAIL")?.takeIf { it.isNotBlank() }
                ?: error(
                    "Set VILLAS_INITIAL_OWNER_EMAIL in the private local configuration before owner setup."
                )
        StaffDirectory.email(email)
        SpringApplicationBuilder(Application::class.java)
            .web(WebApplicationType.NONE)
            .run("--villas.mode=production")
            .use { context ->
                context.getBean(StaffDirectory::class.java).bootstrap(email, replacePending)
                println(
                    "Initial owner invitation is ready. Google verification is required to activate the account."
                )
            }
    }
}
