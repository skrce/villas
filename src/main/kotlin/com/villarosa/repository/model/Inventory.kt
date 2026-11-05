package com.villarosa.repository.model

import com.fasterxml.jackson.annotation.JsonIgnore
import com.villarosa.service.PropertyScope
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.persistence.*
import java.time.Instant
import java.time.LocalDate
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.type.SqlTypes

@Entity
@Table(name = "maintenance_blocks")
data class MaintenanceBlock(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) val id: Int? = null,
    @Column(name = "room_id", nullable = false) val roomId: Int = 0,
    @Column(name = "start_date", nullable = false) val startDate: LocalDate = LocalDate.MIN,
    @Column(name = "end_date", nullable = false) val endDate: LocalDate = LocalDate.MIN,
    @Column(nullable = false, length = 200) val reason: String = "Maintenance",
    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(nullable = false, length = 16)
    var status: ReservationStatus = ReservationStatus.ACTIVE,
    @Version @Column(nullable = false) var version: Long = 0,
    @JsonIgnore
    @Column(name = "property_id", nullable = false, length = 64)
    val propertyId: String = PropertyScope.ID,
)

@Entity
@Table(
    name = "inventory_operations",
    uniqueConstraints =
        [
            UniqueConstraint(
                columnNames = ["property_id", "actor_id", "operation_kind", "operation_key"]
            )
        ],
)
data class InventoryOperation(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) val id: Long? = null,
    @Column(name = "property_id", nullable = false, length = 64)
    val propertyId: String = PropertyScope.ID,
    @Column(name = "actor_id", nullable = false, length = 64) val actorId: String = "development",
    @Column(name = "operation_kind", nullable = false, length = 32) val kind: String = "",
    @Column(name = "operation_key", nullable = false, length = 36) val key: String = "",
    @Column(name = "request_hash", nullable = false, length = 64) val requestHash: String = "",
    @Column(name = "result_json", columnDefinition = "LONGTEXT") val resultJson: String? = null,
    @Column(name = "created_at", nullable = false) val createdAt: Instant = Instant.now(),
)

@Entity
@Table(
    name = "inventory_events",
    uniqueConstraints =
        [
            UniqueConstraint(columnNames = ["property_id", "reservation_id", "resource_version"]),
            UniqueConstraint(
                columnNames = ["property_id", "maintenance_block_id", "resource_version"]
            ),
        ],
)
data class InventoryEvent(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) val id: Long? = null,
    @Column(name = "property_id", nullable = false, length = 64)
    val propertyId: String = PropertyScope.ID,
    @Column(name = "actor_id", nullable = false, length = 64) val actorId: String = "development",
    @Column(name = "operation_key", nullable = false, length = 36) val operationKey: String = "",
    @Column(nullable = false, length = 32) val kind: String = "",
    @Column(name = "reservation_id") val reservationId: Int? = null,
    @Column(name = "maintenance_block_id") val maintenanceBlockId: Int? = null,
    @Column(name = "resource_version", nullable = false) val resourceVersion: Long = 0,
    @Column(name = "room_id", nullable = false) val roomId: Int = 0,
    @Column(name = "previous_room_id") val previousRoomId: Int? = null,
    @Column(name = "start_date", nullable = false) val startDate: LocalDate = LocalDate.MIN,
    @Column(name = "end_date", nullable = false) val endDate: LocalDate = LocalDate.MIN,
    @Column(name = "guest_count") val guestCount: Int? = null,
    @Column(name = "occurred_at", nullable = false) val occurredAt: Instant = Instant.now(),
)

enum class OperationKind {
    CREATE,
    MOVE,
    CHANGE,
    CANCEL,
    BLOCK,
    UNBLOCK,
}

data class OperationResult(
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val key: String,
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val kind: OperationKind,
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val resourceId: Int,
    val reservation: ReservationInfo? = null,
    val maintenance: MaintenanceBlock? = null,
)
