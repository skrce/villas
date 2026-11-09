package com.villarosa.service

import com.villarosa.exception.conflict
import com.villarosa.exception.invalid
import com.villarosa.exception.missing
import com.villarosa.repository.*
import com.villarosa.repository.model.*
import com.villarosa.security.BusinessAudit
import com.villarosa.security.CurrentStaff
import com.villarosa.security.StaffAccess
import java.time.ZoneOffset
import org.springframework.data.domain.PageRequest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional

object OperationReason {
    fun optional(value: String?): String? {
        val result = value?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        if (result.length > 500 || result.any { it.isISOControl() })
            invalid("INVALID_REASON", "Use at most 500 characters without control characters.")
        return result
    }

    fun required(value: String?): String =
        optional(value) ?: invalid("REASON_REQUIRED", "Enter a reason for this action.")
}

@Service
class ReadinessService(
    private val rooms: ApartmentRepository,
    private val readiness: ReadinessRepository,
    private val events: ReadinessEventRepository,
    private val jdbc: JdbcTemplate,
    private val operations: OperationCoordinator,
    private val current: CurrentStaff,
    private val access: StaffAccess,
    private val time: PropertyTime,
    private val audit: BusinessAudit,
) {
    @Transactional(readOnly = true)
    fun read(roomId: Int): ReadinessView {
        access.current(current.identity())
        if (rooms.findByPropertyIdAndId(PropertyScope.ID, roomId) == null)
            missing("Room does not exist.")
        return readiness.findByPropertyIdAndRoomId(PropertyScope.ID, roomId)?.view()
            ?: ReadinessView(roomId, ReadinessState.DIRTY, 0, null)
    }

    fun change(
        roomId: Int,
        state: ReadinessState,
        expected: Long,
        key: String,
        reason: String?,
    ): OperationResult {
        val normalized = OperationReason.optional(reason)
        return operations.execute(
            OperationKind.SET_READINESS,
            key,
            listOf(roomId, state, expected, normalized),
        ) { operationKey ->
            transition(roomId, state, expected, operationKey, normalized)
        }
    }

    @Transactional(propagation = Propagation.MANDATORY)
    fun transition(
        roomId: Int,
        state: ReadinessState,
        expected: Long,
        key: String,
        reason: String?,
    ): OperationResult {
        val room = rooms.locked(PropertyScope.ID, roomId) ?: missing("Room does not exist.")
        if (!room.active) conflict("ROOM_INACTIVE", "Restore the room before changing readiness.")
        val saved = locked(room)
        checkVersion(saved.version, expected)
        var event: ReadinessEventInfo? = null
        if (saved.state != state) {
            assertEmpty(roomId)
            val allowed =
                when (saved.state) {
                    ReadinessState.DIRTY -> setOf(ReadinessState.IN_PROGRESS)
                    ReadinessState.IN_PROGRESS ->
                        setOf(ReadinessState.INSPECTION, ReadinessState.DIRTY)
                    ReadinessState.INSPECTION -> setOf(ReadinessState.CLEAN, ReadinessState.DIRTY)
                    ReadinessState.CLEAN -> setOf(ReadinessState.DIRTY)
                }
            if (state !in allowed)
                conflict(
                    "INVALID_READINESS_TRANSITION",
                    "Follow cleaning, inspection and clean in order.",
                )
            val explanation =
                if (state == ReadinessState.DIRTY) OperationReason.required(reason) else reason
            event = update(saved, state, key, explanation, null)
        }
        return OperationResult(
            key,
            OperationKind.SET_READINESS,
            roomId,
            readiness = saved.view(),
            readinessEvent = event,
        )
    }

    @Transactional(propagation = Propagation.MANDATORY)
    fun locked(room: Apartment): RoomReadiness {
        jdbc.update(
            "INSERT INTO room_readiness (room_id,property_id,state,version,changed_at) VALUES (?,?,'DIRTY',0,?) ON CONFLICT DO NOTHING",
            room.id!!,
            PropertyScope.ID,
            time.now().atOffset(ZoneOffset.UTC),
        )
        return readiness.locked(PropertyScope.ID, room.id!!)
            ?: missing("Room readiness does not exist.")
    }

    @Transactional(propagation = Propagation.MANDATORY)
    fun assertReady(room: Apartment, expected: Long? = null): ReadinessView {
        assertEmpty(room.id!!)
        val state = locked(room)
        if (expected != null) checkVersion(state.version, expected)
        if (state.state != ReadinessState.CLEAN)
            conflict("ROOM_NOT_READY", "Finish cleaning and inspection before checking in.")
        return state.view()
    }

    fun assertEmpty(roomId: Int, excluded: Int = -1) {
        if (
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM reservations WHERE property_id=? AND room_id=? AND stay_phase='CHECKED_IN' AND id<>?",
                Long::class.java,
                PropertyScope.ID,
                roomId,
                excluded,
            ) != 0L
        )
            conflict(
                "ROOM_OCCUPIED",
                "Record the current guest's departure before using this room.",
            )
    }

    @Transactional(propagation = Propagation.MANDATORY)
    fun dirty(room: Apartment, key: String, reservationId: Int): ReadinessView {
        val state = locked(room)
        if (state.state != ReadinessState.DIRTY)
            update(state, ReadinessState.DIRTY, key, null, reservationId)
        return state.view()
    }

    @Transactional(readOnly = true)
    fun history(roomId: Int, after: String, limit: Int): ReadinessHistory {
        read(roomId)
        val cursor =
            after.takeIf { it.matches(Regex("0|[1-9][0-9]*")) }?.toLongOrNull()
                ?: invalid("INVALID_CURSOR", "Use a nonnegative event cursor.")
        if (limit !in 1..100)
            invalid("INVALID_PAGE_SIZE", "Readiness history pages contain 1 to 100 entries.")
        val rows = events.history(PropertyScope.ID, roomId, cursor, PageRequest.of(0, limit + 1))
        val items = rows.take(limit).map { it.info() }
        return ReadinessHistory(items, if (rows.size > limit) items.last().id else null)
    }

    private fun update(
        saved: RoomReadiness,
        state: ReadinessState,
        key: String,
        reason: String?,
        reservationId: Int?,
    ): ReadinessEventInfo {
        val previous = saved.state
        saved.state = state
        saved.changedAt = time.now()
        readiness.saveAndFlush(saved)
        val event =
            events.saveAndFlush(
                ReadinessEvent(
                    roomId = saved.roomId,
                    actorId = current.identity().id,
                    operationKey = key,
                    resourceVersion = saved.version,
                    previousState = previous,
                    state = state,
                    reason = reason,
                    reservationId = reservationId,
                    occurredAt = saved.changedAt,
                )
            )
        audit.record(current.identity().id, "READINESS_CHANGED", "ROOM", saved.roomId.toString())
        return event.info()
    }

    private fun RoomReadiness.view() = ReadinessView(roomId, state, version, changedAt)

    companion object {
        fun checkVersion(actual: Long, expected: Long) {
            if (expected < 0) invalid("INVALID_VERSION", "Version must not be negative.")
            if (actual != expected)
                conflict("STALE_VERSION", "This record changed. Reload it before confirming.")
        }
    }
}
