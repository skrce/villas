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
        fun verify(connection: Connection) {
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
