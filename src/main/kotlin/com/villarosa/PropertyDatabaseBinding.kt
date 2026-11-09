package com.villarosa

import com.villarosa.service.PropertyScope
import java.sql.Connection
import javax.sql.DataSource
import org.springframework.stereotype.Component

@Component
class PropertyDatabaseBinding(
    dataSource: DataSource,
    environment: org.springframework.core.env.Environment =
        org.springframework.core.env.StandardEnvironment(),
    context: org.springframework.context.ApplicationContext =
        org.springframework.context.support.StaticApplicationContext(),
) {
    init {
        dataSource.connection.use { connection ->
            if (connection.metaData.databaseProductName == "PostgreSQL") {
                verify(connection)
                if (
                    environment.getProperty("villas.mode", "production") == "production" &&
                        context is org.springframework.web.context.WebApplicationContext
                )
                    verifyRuntime(connection)
            }
        }
    }

    companion object {
        fun verify(connection: Connection) = verify(connection, requireRegistry = true)

        fun verifyBeforeMigration(connection: Connection) =
            verify(connection, requireRegistry = false)

        private fun sharedSchema(connection: Connection): Boolean =
            connection
                .prepareStatement(
                    "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='flyway_schema_history'"
                )
                .use {
                    it.executeQuery().use { rows ->
                        rows.next() &&
                            connection
                                .prepareStatement(
                                    "SELECT 1 FROM flyway_schema_history WHERE version='18' AND success=TRUE"
                                )
                                .use { history ->
                                    history.executeQuery().use { applied -> applied.next() }
                                }
                    }
                }

        fun verifyRuntime(connection: Connection) {
            require(sharedSchema(connection)) {
                "Apply shared database isolation before starting the runtime."
            }
            connection.createStatement().use { sql ->
                sql.executeQuery(
                        "SELECT EXISTS(SELECT 1 FROM pg_roles r WHERE (r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication) AND pg_has_role(current_user,r.oid,'MEMBER')) OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND pg_has_role(current_user,c.relowner,'MEMBER'))"
                    )
                    .use { rows ->
                        require(rows.next() && !rows.getBoolean(1)) {
                            "Runtime credentials must not own tables or inherit administrative/RLS-bypass authority."
                        }
                    }
                sql.executeQuery(
                        "SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND (c.relname IN ('businesses','staff_identities') OR EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='property_id' AND NOT a.attisdropped)) AND NOT c.relrowsecurity"
                    )
                    .use { rows ->
                        require(rows.next() && rows.getInt(1) == 0) {
                            "The complete shared row-security policy set is required."
                        }
                    }
                sql.executeQuery(
                        "SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('villas_has_business','villas_identity_matches','villas_identity_business','villas_admission_business') AND p.prosecdef AND has_function_privilege(current_user,p.oid,'EXECUTE') AND p.proconfig=ARRAY['search_path=pg_catalog, pg_temp'] AND NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')"
                    )
                    .use { rows ->
                        require(rows.next() && rows.getInt(1) == 4) {
                            "Restricted row-security helpers are required."
                        }
                    }
            }
        }

        private fun verify(connection: Connection, requireRegistry: Boolean) {
            if (sharedSchema(connection)) return
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
                        require(rows.next() && (!requireRegistry || rows.getBoolean(1))) {
                            "The configured business is not registered and active."
                        }
                    }
                }
            }
        }
    }
}
