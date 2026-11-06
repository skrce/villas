package com.villarosa.repository.model

import io.swagger.v3.oas.annotations.media.Schema
import java.time.Instant
import java.time.LocalDate

data class ReservationPage(
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val items: List<ReservationInfo>,
    val nextCursor: Int?,
)

data class MaintenancePage(
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val items: List<MaintenanceBlock>,
    val nextCursor: Int?,
)

data class InventoryEventPage(
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val items: List<InventoryEventInfo>,
    val nextCursor: String?,
)

data class InventoryEventInfo(
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val id: String,
    val actorId: String,
    val operationKey: String,
    val kind: String,
    val resourceVersion: Long,
    val roomId: Int,
    val previousRoomId: Int?,
    val startDate: LocalDate,
    val endDate: LocalDate,
    val guestCount: Int?,
    val occurredAt: Instant,
) {
    companion object {
        fun from(event: InventoryEvent) =
            InventoryEventInfo(
                event.id!!.toString(),
                event.actorId,
                event.operationKey,
                event.kind,
                event.resourceVersion,
                event.roomId,
                event.previousRoomId,
                event.startDate,
                event.endDate,
                event.guestCount,
                event.occurredAt,
            )
    }
}
