package com.villarosa.security

import com.villarosa.exception.DomainException
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.ConnectionCallback
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager as Transactions

@Component
class DatabaseScope(private val jdbc: JdbcTemplate) {
    private data class Claims(
        val business: String = "",
        val person: String = "",
        val personVersion: String = "",
        val member: String = "",
        val memberVersion: String = "",
        val issuer: String = "",
        val subject: String = "",
        val email: String = "",
    )

    fun identity(session: StaffSessionIdentity) =
        bind(Claims(person = session.id, personVersion = session.securityVersion.toString()))

    fun admission(verified: VerifiedStaffIdentity) =
        bind(
            Claims(
                issuer = verified.issuer,
                subject = verified.subject,
                email = StaffDirectory.email(verified.email),
            )
        )

    fun business(id: String, actor: StaffIdentity) {
        BusinessIds.requireValid(id)
        val person = actor.personId ?: denied()
        val version = actor.personVersion ?: denied()
        bind(Claims(id, person, version.toString(), actor.id, actor.securityVersion.toString()))
    }

    // A locked write retains authority through its own membership revocation and audit insert.
    fun admitLockedWrite() {
        val claims =
            Transactions.getResource(this) as? Claims ?: error("No transaction business scope.")
        check(claims.business.isNotEmpty()) { "A write needs business authorization." }
        jdbc.execute(
            ConnectionCallback { connection ->
                if (connection.metaData.databaseProductName == "PostgreSQL") {
                    connection
                        .prepareStatement(
                            "SELECT set_config('villas.admitted',concat_ws('/',pg_current_xact_id()::text,?,?,?,?,?),true)"
                        )
                        .use { statement ->
                            listOf(
                                    claims.business,
                                    claims.person,
                                    claims.personVersion,
                                    claims.member,
                                    claims.memberVersion,
                                )
                                .forEachIndexed { index, value ->
                                    statement.setString(index + 1, value)
                                }
                            statement.execute()
                        }
                }
            }
        )
    }

    private fun bind(claims: Claims) {
        check(Transactions.isActualTransactionActive() && Transactions.isSynchronizationActive()) {
            "Database authorization requires an active transaction."
        }
        val previous = Transactions.getResource(this)
        if (previous != null) {
            if (previous != claims)
                throw DomainException(
                    "BUSINESS_CONTEXT_CHANGED",
                    HttpStatus.FORBIDDEN,
                    "A transaction cannot change its authorization context.",
                )
            return
        }
        jdbc.execute(
            ConnectionCallback { connection ->
                if (connection.metaData.databaseProductName == "PostgreSQL") {
                    check(!connection.autoCommit) {
                        "Database scope must use the transaction connection."
                    }
                    connection
                        .prepareStatement(
                            "SELECT set_config('villas.business_id',?,true),set_config('villas.person_id',?,true),set_config('villas.person_version',?,true),set_config('villas.member_id',?,true),set_config('villas.member_version',?,true),set_config('villas.login_issuer',?,true),set_config('villas.login_subject',?,true),set_config('villas.login_email',?,true),set_config('villas.admitted','',true)"
                        )
                        .use { statement ->
                            listOf(
                                    claims.business,
                                    claims.person,
                                    claims.personVersion,
                                    claims.member,
                                    claims.memberVersion,
                                    claims.issuer,
                                    claims.subject,
                                    claims.email,
                                )
                                .forEachIndexed { index, value ->
                                    statement.setString(index + 1, value)
                                }
                            statement.execute()
                        }
                }
            }
        )
        Transactions.bindResource(this, claims)
        Transactions.registerSynchronization(
            object : TransactionSynchronization {
                override fun suspend() {
                    Transactions.unbindResource(this@DatabaseScope)
                }

                override fun resume() {
                    Transactions.bindResource(this@DatabaseScope, claims)
                }

                override fun afterCompletion(status: Int) {
                    Transactions.unbindResourceIfPossible(this@DatabaseScope)
                }
            }
        )
    }

    private fun denied(): Nothing =
        throw DomainException(
            "BUSINESS_ACCESS_DENIED",
            HttpStatus.FORBIDDEN,
            "This business is unavailable for your account.",
        )
}
