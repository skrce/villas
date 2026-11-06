package com.villarosa.service

import com.villarosa.exception.conflict
import com.villarosa.exception.invalid
import com.villarosa.exception.missing
import com.villarosa.repository.ApartmentRepository
import com.villarosa.repository.SeasonalRate
import com.villarosa.repository.SeasonalRateRepository
import com.villarosa.repository.model.Apartment
import com.villarosa.security.BusinessAudit
import com.villarosa.security.CurrentStaff
import com.villarosa.security.StaffAccess
import java.time.LocalDate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional

@Service
@Transactional(isolation = Isolation.READ_COMMITTED)
class RateService(
    private val rooms: ApartmentRepository,
    private val seasons: SeasonalRateRepository,
    private val current: CurrentStaff,
    private val access: StaffAccess,
    private val audit: BusinessAudit,
) {
    fun get(roomId: Int): RoomRates {
        access.current(current.identity())
        return read(rooms.locked(PropertyScope.ID, roomId) ?: missing("Room does not exist."))
    }

    fun update(
        roomId: Int,
        expectedVersion: Long,
        currency: String,
        baseNightlyCents: Long,
        seasonal: List<SeasonRate>,
    ): RoomRates {
        val actor = access.lockOwner(current.identity())
        EuroCents.currency(currency)
        EuroCents.positive(baseNightlyCents)
        val normalized = PriceCalculator.seasons(seasonal)
        val room = rooms.locked(PropertyScope.ID, roomId) ?: missing("Room does not exist.")
        if (expectedVersion < 0) invalid("INVALID_VERSION", "Version must not be negative.")
        if (room.rateVersion != expectedVersion)
            conflict("STALE_VERSION", "The room rates changed. Reload them before editing.")
        if (room.rateVersion >= EuroCents.MAX)
            conflict("RATE_VERSION_LIMIT", "The room's rate version exceeds the supported range.")
        seasons.deleteForRoom(PropertyScope.ID, roomId)
        seasons.saveAllAndFlush(
            normalized.map {
                SeasonalRate(
                    roomId = roomId,
                    name = it.name,
                    startDate = LocalDate.parse(it.startDate),
                    endDate = LocalDate.parse(it.endDate),
                    nightlyCents = it.nightlyCents,
                )
            }
        )
        room.baseRateCents = baseNightlyCents
        room.rateVersion++
        rooms.saveAndFlush(room)
        audit.record(actor.id, "ROOM_RATES_UPDATED", "ROOM", roomId.toString())
        return read(room)
    }

    fun preview(roomId: Int, start: String, end: String, guestCount: Int): StayPrice {
        access.current(current.identity())
        val room = rooms.locked(PropertyScope.ID, roomId) ?: missing("Room does not exist.")
        checkRoom(room, guestCount)
        return PriceCalculator.calculate(read(room), StayDates.parse(start, end))
    }

    @Transactional(propagation = Propagation.MANDATORY)
    fun read(room: Apartment): RoomRates =
        RoomRates(
            room.id!!,
            currency = room.rateCurrency,
            baseNightlyCents = room.baseRateCents,
            version = room.rateVersion,
            seasons =
                seasons.findByPropertyIdAndRoomIdOrderByStartDate(PropertyScope.ID, room.id!!).map {
                    SeasonRate(
                        it.name,
                        it.startDate.toString(),
                        it.endDate.toString(),
                        it.nightlyCents,
                    )
                },
        )

    fun checkRoom(room: Apartment, guestCount: Int) {
        if (!room.active) conflict("ROOM_INACTIVE", "Restore this room before quoting a stay.")
        if (guestCount <= 0) invalid("INVALID_GUEST_COUNT", "Guest count must be positive.")
        if (guestCount > (room.capacity ?: 0))
            invalid("CAPACITY_EXCEEDED", "Guest count exceeds room capacity.")
    }
}
