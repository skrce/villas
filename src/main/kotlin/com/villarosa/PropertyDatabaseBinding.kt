package com.villarosa

import com.villarosa.service.PropertyScope
import javax.sql.DataSource
import org.springframework.stereotype.Component

@Component
class PropertyDatabaseBinding(dataSource: DataSource) {
    init {
        dataSource.connection.use { connection ->
            if (connection.metaData.databaseProductName == "PostgreSQL") {
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
            }
        }
    }
}
