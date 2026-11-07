package com.villarosa.repository.model

import com.fasterxml.jackson.annotation.JsonIgnore
import com.villarosa.service.PropertyScope
import jakarta.persistence.*
import java.time.Instant
import org.hibernate.annotations.ColumnDefault
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.type.SqlTypes

enum class ReadinessState {
    DIRTY,
    IN_PROGRESS,
    INSPECTION,
    CLEAN,
}

@Entity
@Table(name = "room_readiness")
data class RoomReadiness(
    @Id @Column(name = "room_id") val roomId: Int = 0,
    @JsonIgnore
    @Column(name = "property_id", nullable = false, length = 64)
    val propertyId: String = PropertyScope.ID,
    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @ColumnDefault("'DIRTY'")
    @Column(nullable = false, length = 16)
    var state: ReadinessState = ReadinessState.DIRTY,
    @Version @ColumnDefault("0") @Column(nullable = false) var version: Long = 0,
    @Column(name = "changed_at", nullable = false) var changedAt: Instant = Instant.EPOCH,
)

data class ReadinessView(
    val roomId: Int,
    val state: ReadinessState,
    val version: Long,
    val changedAt: Instant?,
)

@Entity
@Table(name = "readiness_events")
data class ReadinessEvent(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) val id: Long? = null,
    @JsonIgnore
    @Column(name = "property_id", nullable = false, length = 64)
    val propertyId: String = PropertyScope.ID,
    @Column(name = "room_id", nullable = false) val roomId: Int = 0,
    @Column(name = "actor_id", nullable = false, length = 36) val actorId: String = "",
    @Column(name = "operation_key", nullable = false, length = 36) val operationKey: String = "",
    @Column(name = "resource_version", nullable = false) val resourceVersion: Long = 0,
    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(name = "previous_state", nullable = false, length = 16)
    val previousState: ReadinessState = ReadinessState.DIRTY,
    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(nullable = false, length = 16)
    val state: ReadinessState = ReadinessState.DIRTY,
    @Column(length = 500) val reason: String? = null,
    @Column(name = "reservation_id") val reservationId: Int? = null,
    @Column(name = "occurred_at", nullable = false) val occurredAt: Instant = Instant.EPOCH,
)

data class ReadinessEventInfo(
    val id: String,
    val actorId: String,
    val operationKey: String,
    val version: Long,
    val previousState: ReadinessState,
    val state: ReadinessState,
    val reason: String?,
    val reservationId: Int?,
    val occurredAt: Instant,
)

data class ReadinessHistory(val items: List<ReadinessEventInfo>, val nextCursor: String?)
