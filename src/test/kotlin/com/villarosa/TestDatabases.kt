package com.villarosa

import com.github.dockerjava.api.model.ExposedPort
import com.github.dockerjava.api.model.PortBinding
import com.github.dockerjava.api.model.Ports
import org.testcontainers.postgresql.PostgreSQLContainer
import org.testcontainers.utility.DockerImageName

object TestDatabases {
    fun postgres(): PostgreSQLContainer =
        PostgreSQLContainer(
                DockerImageName.parse(
                        checkNotNull(TestDatabases::class.java.getResource("/postgres-image.txt"))
                            .readText()
                            .trim()
                    )
                    .asCompatibleSubstituteFor("postgres")
            )
            .withDatabaseName("villarosa")
            .withUsername("villas_test")
            .withPassword("synthetic-test-password")
            .withCreateContainerCmdModifier { command ->
                command.hostConfig?.withPortBindings(
                    PortBinding(Ports.Binding.bindIp("127.0.0.1"), ExposedPort(5432))
                )
            }
}
