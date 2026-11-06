package com.villarosa.service

import com.villarosa.exception.DomainException
import com.villarosa.exception.conflict
import com.villarosa.exception.invalid
import com.villarosa.repository.model.OperationKind
import com.villarosa.repository.model.OperationResult
import com.villarosa.security.CurrentStaff
import com.villarosa.security.StaffAccess
import java.security.MessageDigest
import java.util.HexFormat
import java.util.UUID
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.support.TransactionTemplate
import tools.jackson.databind.ObjectMapper

@Service
class OperationCoordinator(
    manager: PlatformTransactionManager,
    private val jdbc: JdbcTemplate,
    private val json: ObjectMapper,
    private val access: StaffAccess,
    private val current: CurrentStaff,
) {
    private val transactions =
        TransactionTemplate(manager).apply {
            propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRES_NEW
            isolationLevel = TransactionDefinition.ISOLATION_READ_COMMITTED
        }
    private val keyShape =
        Regex("[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}")

    fun key(value: String): String {
        if (!keyShape.matches(value))
            invalid("INVALID_OPERATION_KEY", "Idempotency-Key must be a UUID.")
        return UUID.fromString(value).toString()
    }

    fun execute(
        kind: OperationKind,
        suppliedKey: String,
        input: Any,
        mutate: (String) -> OperationResult,
    ): OperationResult {
        val key = key(suppliedKey)
        val fingerprint =
            HexFormat.of()
                .formatHex(
                    MessageDigest.getInstance("SHA-256").digest(json.writeValueAsBytes(input))
                )
        try {
            return checkNotNull(
                transactions.execute {
                    val actor = access.lockOwner(current.identity()).id
                    jdbc.update(
                        "INSERT INTO inventory_operations (property_id, actor_id, operation_kind, operation_key, request_hash, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP(6))",
                        PropertyScope.ID,
                        actor,
                        kind.name,
                        key,
                        fingerprint,
                    )
                    val result = mutate(key)
                    check(
                        jdbc.update(
                            "UPDATE inventory_operations SET result_json=? WHERE property_id=? AND actor_id=? AND operation_kind=? AND operation_key=?",
                            json.writeValueAsString(result),
                            PropertyScope.ID,
                            actor,
                            kind.name,
                            key,
                        ) == 1
                    )
                    result
                }
            )
        } catch (duplicate: DuplicateKeyException) {
            return checkNotNull(
                transactions.execute {
                    val actor = access.lockOwner(current.identity()).id
                    val saved = record(kind, key, actor) ?: throw duplicate
                    if (saved.first != fingerprint)
                        conflict(
                            "IDEMPOTENCY_KEY_REUSED",
                            "This operation key was already used with different input.",
                        )
                    json.readValue(saved.second, OperationResult::class.java)
                }
            )
        }
    }

    fun find(kind: OperationKind, suppliedKey: String): OperationResult =
        checkNotNull(
            transactions.execute {
                val actor = access.current(current.identity()).id
                val saved =
                    record(kind, key(suppliedKey), actor)
                        ?: throw DomainException(
                            "OPERATION_NOT_COMMITTED",
                            HttpStatus.NOT_FOUND,
                            "No committed result is available. Reconcile or retry with the same operation key.",
                        )
                json.readValue(saved.second, OperationResult::class.java)
            }
        )

    private fun record(kind: OperationKind, key: String, actor: String): Pair<String, String>? =
        jdbc
            .query(
                "SELECT request_hash, result_json FROM inventory_operations WHERE property_id=? AND actor_id=? AND operation_kind=? AND operation_key=?",
                { row, _ -> row.getString(1) to row.getString(2) },
                PropertyScope.ID,
                actor,
                kind.name,
                key,
            )
            .singleOrNull()
}
