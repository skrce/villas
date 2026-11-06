package com.villarosa.service

import com.villarosa.exception.conflict
import com.villarosa.exception.invalid
import com.villarosa.exception.missing
import com.villarosa.repository.ApartmentRepository
import com.villarosa.repository.model.Apartment
import com.villarosa.security.BusinessAudit
import com.villarosa.security.CurrentStaff
import com.villarosa.security.StaffAccess
import java.util.Locale
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Sort
import org.springframework.data.jpa.domain.Specification
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional

@Service
@Transactional(isolation = Isolation.READ_COMMITTED)
class ApartmentService(
    private val apartmentRepository: ApartmentRepository,
    private val current: CurrentStaff,
    private val access: StaffAccess,
    private val audit: BusinessAudit,
    private val protection: BookingProtection,
) {
    @Transactional(readOnly = true)
    fun getAllApartments(): List<Apartment> {
        access.current(current.identity())
        return apartmentRepository.findByPropertyId(PropertyScope.ID)
    }

    @Transactional(readOnly = true)
    fun findApartmentById(id: Int): Apartment? {
        access.current(current.identity())
        return apartmentRepository.findByPropertyIdAndId(PropertyScope.ID, id)
    }

    @Transactional(readOnly = true)
    fun directory(name: String?, includeArchived: Boolean, after: Int, limit: Int): RoomPage {
        access.current(current.identity())
        if (after < 0) invalid("INVALID_CURSOR", "Cursor must not be negative.")
        if (limit !in 1..100) invalid("INVALID_PAGE_SIZE", "Limit must be between 1 and 100.")
        val search =
            RoomProfile.text(name, 200)
                .orEmpty()
                .lowercase(Locale.ROOT)
                .replace("!", "!!")
                .replace("%", "!%")
                .replace("_", "!_")
        val specification =
            Specification<Apartment> { root, _, cb ->
                val filters =
                    mutableListOf(
                        cb.equal(root.get<String>("propertyId"), PropertyScope.ID),
                        cb.greaterThan(root.get("id"), after),
                    )
                if (!includeArchived) filters += cb.isTrue(root.get("active"))
                if (search.isNotEmpty())
                    filters +=
                        cb.or(
                            cb.like(cb.lower(root.get("name")), "%$search%", '!'),
                            cb.like(cb.lower(root.get("reference")), "%$search%", '!'),
                        )
                cb.and(*filters.toTypedArray())
            }
        val rows =
            apartmentRepository
                .findAll(specification, PageRequest.of(0, limit + 1, Sort.by("id")))
                .content
        val items = rows.take(limit)
        return RoomPage(items, if (rows.size > limit) items.last().id else null)
    }

    fun create(input: RoomProfile): Apartment {
        val actor = access.lockOwner(current.identity())
        val profile = input.normalized()
        referenceAvailable(profile.reference, 0)
        val room = Apartment(capacity = profile.capacity).apply { assign(profile) }
        apartmentRepository.saveAndFlush(room)
        audit.record(actor.id, "ROOM_CREATED", "ROOM", room.id!!.toString())
        return room
    }

    fun update(id: Int, version: Long, input: RoomProfile): Apartment {
        val actor = access.lockOwner(current.identity())
        val room =
            apartmentRepository.locked(PropertyScope.ID, id) ?: missing("Room does not exist.")
        expected(room.version, version)
        val profile = input.normalized()
        referenceAvailable(profile.reference, id)
        protection.roomChange(id, profile.capacity, room.active)
        room.assign(profile)
        apartmentRepository.saveAndFlush(room)
        audit.record(actor.id, "ROOM_UPDATED", "ROOM", id.toString())
        return room
    }

    fun status(id: Int, version: Long, active: Boolean): Apartment {
        val actor = access.lockOwner(current.identity())
        val room =
            apartmentRepository.locked(PropertyScope.ID, id) ?: missing("Room does not exist.")
        expected(room.version, version)
        if (room.active != active) {
            protection.roomChange(id, room.capacity!!, active)
            room.active = active
            apartmentRepository.saveAndFlush(room)
            audit.record(
                actor.id,
                if (active) "ROOM_RESTORED" else "ROOM_ARCHIVED",
                "ROOM",
                id.toString(),
            )
        }
        return room
    }

    private fun expected(actual: Long, expected: Long) {
        if (expected < 0) invalid("INVALID_VERSION", "Version must not be negative.")
        if (actual != expected)
            conflict("STALE_VERSION", "The room changed. Reload it before editing.")
    }

    private fun referenceAvailable(reference: String, id: Int) {
        if (
            apartmentRepository.existsByPropertyIdAndReferenceAndIdNot(
                PropertyScope.ID,
                reference,
                id,
            )
        )
            conflict(
                "ROOM_REFERENCE_EXISTS",
                "This room reference is already in use. Choose another reference or open that room.",
            )
    }

    private fun Apartment.assign(profile: RoomProfile) {
        name = profile.name
        reference = profile.reference
        capacity = profile.capacity
        orientation = profile.orientation
        view = profile.view
        bedConfiguration = profile.bedConfiguration
        features = profile.features
        floor = profile.floor
    }
}
