package com.villarosa.security

import com.villarosa.Application
import com.villarosa.PrivateSettings
import org.springframework.boot.WebApplicationType
import org.springframework.boot.builder.SpringApplicationBuilder

object OwnerBootstrap {
    fun run(replacePending: Boolean, recovery: Boolean = false) {
        val email =
            PrivateSettings.resolve()["VILLAS_INITIAL_OWNER_EMAIL"]?.takeIf { it.isNotBlank() }
                ?: error(
                    "Set VILLAS_INITIAL_OWNER_EMAIL in the private local configuration before owner setup."
                )
        StaffDirectory.email(email)
        val businessId =
            BusinessIds.requireValid(
                PrivateSettings.resolve()["VILLAS_OWNER_BUSINESS_ID"]
                    ?: com.villarosa.service.PropertyScope.ID
            )
        SpringApplicationBuilder(Application::class.java)
            .web(WebApplicationType.NONE)
            .run("--villas.mode=production")
            .use { context ->
                val directory = context.getBean(StaffDirectory::class.java)
                if (recovery) directory.recover(email, businessId)
                else directory.bootstrap(email, replacePending, businessId)
                println(
                    "Owner invitation is ready. Google verification is required to activate the account."
                )
            }
    }
}
