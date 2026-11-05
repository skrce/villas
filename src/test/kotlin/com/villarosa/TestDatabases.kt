package com.villarosa

import com.github.dockerjava.api.model.ExposedPort
import com.github.dockerjava.api.model.PortBinding
import com.github.dockerjava.api.model.Ports
import org.testcontainers.mariadb.MariaDBContainer
import org.testcontainers.utility.DockerImageName

object TestDatabases {
    fun mariaDb(): MariaDBContainer =
        MariaDBContainer(
                DockerImageName.parse(
                        checkNotNull(TestDatabases::class.java.getResource("/mariadb-image.txt"))
                            .readText()
                            .trim()
                    )
                    .asCompatibleSubstituteFor("mariadb")
            )
            .withDatabaseName("villarosa")
            .withUsername("villas_test")
            .withPassword("synthetic-test-password")
            .withCreateContainerCmdModifier { command ->
                command.hostConfig?.withPortBindings(
                    PortBinding(Ports.Binding.bindIp("127.0.0.1"), ExposedPort(3306))
                )
            }
}
