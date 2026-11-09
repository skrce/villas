package com.villarosa

import com.villarosa.service.PropertyScope
import java.sql.Connection
import javax.sql.DataSource
import org.springframework.stereotype.Component

@Component
class PropertyDatabaseBinding(dataSource: DataSource) {
    init {
        dataSource.connection.use { connection ->
            if (connection.metaData.databaseProductName == "PostgreSQL") {
                verify(connection)
            }
        }
    }

    companion object {
        fun verify(connection: Connection) = verify(connection, requireRegistry = true)

        fun verifyBeforeMigration(connection: Connection) =
            verify(connection, requireRegistry = false)

        private fun verify(connection: Connection, requireRegistry: Boolean) {
            connection
                .prepareStatement("SELECT property_id FROM property_identity WHERE singleton=1")
                .use { statement ->
                    statement.executeQuery().use { rows ->
                        require(
                            rows.next() && rows.getString(1) == PropertyScope.ID && !rows.next()
                        ) {
                            "The configured property does not match the database."
                        }
                    }
                }
            val registry =
                connection.metaData.getTables(null, "public", "businesses", arrayOf("TABLE")).use {
                    it.next()
                }
            require(registry || !requireRegistry) {
                "Apply the business registry migration before starting the application."
            }
            if (registry) {
                connection.prepareStatement("SELECT active FROM businesses WHERE id=?").use {
                    statement ->
                    statement.setString(1, PropertyScope.ID)
                    statement.executeQuery().use { rows ->
                        require(rows.next() && rows.getBoolean(1)) {
                            "The configured business is not registered and active."
                        }
                    }
                }
            }
        }
    }
}
