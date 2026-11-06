package com.villarosa.service

import com.villarosa.exception.ExceptionHandler
import com.villarosa.exception.conflict
import com.villarosa.exception.invalid
import com.villarosa.exception.missing
import com.villarosa.repository.CustomerRepository
import com.villarosa.repository.ReservationRepository
import com.villarosa.repository.model.*
import com.villarosa.security.BusinessAudit
import com.villarosa.security.CurrentStaff
import com.villarosa.security.StaffAccess
import java.time.Clock
import java.time.LocalDate
import java.time.ZoneId
import org.springframework.data.domain.PageRequest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional

@Service
@Transactional(isolation = Isolation.READ_COMMITTED)
class CustomerService(
    private val customerRepository: CustomerRepository,
    private val current: CurrentStaff,
    private val access: StaffAccess,
    private val audit: BusinessAudit,
    private val directory: GuestDirectory,
    private val reservations: ReservationRepository,
    private val jdbc: JdbcTemplate,
    private val clock: Clock,
) {
    fun createCustomer(
        firstName: String,
        lastName: String,
        phone: String?,
        address: String?,
        email: String? = null,
        notes: String? = null,
        allowDuplicate: Boolean = false,
    ): Int {
        val actor = access.lockOwner(current.identity())
        val profile = GuestProfile.normalize(firstName, lastName, phone, address, email, notes)
        if (!allowDuplicate && directory.duplicates(profile, exactNamesOnly = true).isNotEmpty())
            conflict(
                "POSSIBLE_DUPLICATE",
                "A guest with this name already exists. Review the matches or explicitly create a separate guest.",
            )
        val guest = Customer().apply { applyProfile(profile) }
        val id = customerRepository.saveAndFlush(guest).id!!
        audit.record(actor.id, "CUSTOMER_CREATED", "CUSTOMER", id.toString())
        return id
    }

    fun update(id: Int, version: Long, profile: GuestProfile): Customer {
        val actor = access.lockOwner(current.identity())
        val guest =
            customerRepository.locked(PropertyScope.ID, id) ?: missing("Guest does not exist.")
        expected(guest.version, version)
        guest.applyProfile(
            GuestProfile.normalize(
                profile.firstName,
                profile.lastName,
                profile.phone,
                profile.address,
                profile.email,
                profile.notes,
            )
        )
        customerRepository.saveAndFlush(guest)
        audit.record(actor.id, "CUSTOMER_UPDATED", "CUSTOMER", id.toString())
        return guest
    }

    fun status(id: Int, version: Long, active: Boolean): Customer {
        val actor = access.lockOwner(current.identity())
        val guest =
            customerRepository.locked(PropertyScope.ID, id) ?: missing("Guest does not exist.")
        expected(guest.version, version)
        if (guest.active != active) {
            if (
                !active &&
                    jdbc.queryForObject(
                        "SELECT COUNT(*) FROM reservations WHERE property_id=? AND customer_id=? AND status='ACTIVE' AND end_date>?",
                        Long::class.java,
                        PropertyScope.ID,
                        id,
                        LocalDate.now(clock.withZone(ZoneId.of("Europe/Skopje"))),
                    ) != 0L
            )
                conflict(
                    "GUEST_HAS_BOOKINGS",
                    "Cancel this guest's current and future reservations before archiving.",
                )
            guest.active = active
            customerRepository.saveAndFlush(guest)
            audit.record(
                actor.id,
                if (active) "CUSTOMER_RESTORED" else "CUSTOMER_ARCHIVED",
                "CUSTOMER",
                id.toString(),
            )
        }
        return guest
    }

    @Transactional(readOnly = true)
    fun findCustomerById(id: Int): java.util.Optional<Customer> {
        access.current(current.identity())
        return java.util.Optional.ofNullable(
            customerRepository.findByPropertyIdAndId(PropertyScope.ID, id)
        )
    }

    @Transactional(readOnly = true)
    fun searchCustomer(firstName: String?, phone: String?, limit: Int = 50): List<Customer> {
        access.current(current.identity())
        if (listOf(firstName, phone).all { it.isNullOrBlank() })
            throw ExceptionHandler.ClientException("You must provide at least one parameter!")
        return directory.query(firstName, phone, false, 0, limit, firstOnly = true).items
    }

    @Transactional(readOnly = true)
    fun query(
        name: String?,
        phone: String?,
        includeArchived: Boolean,
        after: Int,
        limit: Int,
    ): GuestPage {
        access.current(current.identity())
        return directory.query(name, phone, includeArchived, after, limit)
    }

    @Transactional(readOnly = true)
    fun duplicates(profile: GuestProfile): List<Customer> {
        access.current(current.identity())
        return directory.duplicates(
            GuestProfile.normalize(
                profile.firstName,
                profile.lastName,
                profile.phone,
                profile.address,
                profile.email,
                profile.notes,
            )
        )
    }

    @Transactional(readOnly = true)
    fun history(id: Int, after: Int, limit: Int, status: ReservationStatus?): ReservationPage {
        if (findCustomerById(id).isEmpty) missing("Guest does not exist.")
        if (after < 0) invalid("INVALID_CURSOR", "Cursor must not be negative.")
        if (limit !in 1..100) invalid("INVALID_PAGE_SIZE", "Limit must be between 1 and 100.")
        val rows =
            reservations.guestHistory(
                PropertyScope.ID,
                id,
                after,
                status,
                PageRequest.of(0, limit + 1),
            )
        val items = rows.take(limit)
        return ReservationPage(
            items.map { it.toReservationInfo() },
            if (rows.size > limit) items.last().id else null,
        )
    }

    private fun expected(actual: Long, expected: Long) {
        if (expected < 0) invalid("INVALID_VERSION", "Version must not be negative.")
        if (actual != expected)
            conflict("STALE_VERSION", "The guest changed. Reload it before editing.")
    }

    private fun Customer.applyProfile(profile: GuestProfile) {
        firstName = profile.firstName
        lastName = profile.lastName
        phone = profile.phone
        address = profile.address
        email = profile.email
        notes = profile.notes
    }
}
