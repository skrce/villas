package com.villarosa.service

import io.swagger.v3.oas.annotations.media.Schema

enum class ReportKind {
    OCCUPANCY,
    CHARGES,
    COLLECTIONS,
    BALANCES,
}

data class OccupancyRow(
    val roomId: Int,
    val roomName: String,
    val roomReference: String,
    val active: Boolean,
    val roomNights: Long,
    val blockedNights: Long,
    val sellableNights: Long,
    val bookedNights: Long,
)

data class ChargeRow(
    val reservationId: Int,
    val roomId: Int,
    val roomName: String,
    val roomReference: String,
    val guestName: String,
    val phase: String,
    val startDate: String,
    val endDate: String,
    val nights: Long,
    val quoteId: String?,
    val chargeCents: Long?,
)

data class CollectionRow(
    val entryId: String,
    val reservationId: Int,
    val guestName: String,
    val kind: String,
    val method: String?,
    val effectiveDate: String,
    val recordedAt: String,
    val amountCents: Long,
    val reference: String?,
    val paymentId: String?,
    val reversesId: String?,
    val reversedById: String?,
    val collectedCents: Long,
    val refundedCents: Long,
)

data class BalanceRow(
    val reservationId: Int,
    val guestName: String,
    val phase: String,
    val startDate: String,
    val endDate: String,
    val agreedCents: Long?,
    val accommodationCents: Long?,
    val receivedCents: Long,
    val outstandingCents: Long?,
    val creditCents: Long?,
)

data class ReportTotals(
    val roomNights: Long = 0,
    val blockedNights: Long = 0,
    val sellableNights: Long = 0,
    val bookedNights: Long = 0,
    val knownChargeCents: Long = 0,
    val chargeCents: Long? = null,
    val collectedCents: Long = 0,
    val refundedCents: Long = 0,
    val netCollectedCents: Long = 0,
    val knownOutstandingCents: Long = 0,
    val outstandingCents: Long? = null,
    val knownCreditCents: Long = 0,
    val creditCents: Long? = null,
    val unknownPriceCount: Int = 0,
)

data class PeriodReport(
    val kind: ReportKind,
    val startDate: String,
    val endDate: String,
    val propertyDate: String,
    val roomId: Int?,
    val snapshotId: String,
    val totals: ReportTotals,
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val occupancy: List<OccupancyRow>,
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val charges: List<ChargeRow>,
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val collections: List<CollectionRow>,
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val balances: List<BalanceRow>,
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val notices: List<String>,
)

data class TodayQueue(
    val count: Long,
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val items: List<FrontDeskStay>,
)

data class TodayBalances(
    val outstandingCount: Long,
    val outstandingCents: Long,
    val creditCount: Long,
    val creditCents: Long,
    val unknownCount: Long,
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val items: List<BalanceRow>,
)

data class TodayView(
    val propertyDate: String,
    val readAt: String,
    val arrivals: TodayQueue,
    val departures: TodayQueue,
    val inHouse: TodayQueue,
    val attention: TodayQueue,
    val guestsInHouse: Long,
    val activeRooms: Long,
    val roomsWithoutRates: Long,
    val dirtyRooms: Long,
    val cleaningRooms: Long,
    val inspectionRooms: Long,
    val cleanRooms: Long,
    val blockedRooms: Long,
    val balances: TodayBalances,
)
