package com.villarosa.service

import com.villarosa.exception.ExceptionHandler
import com.villarosa.repository.CustomerRepository
import com.villarosa.repository.model.Customer
import com.villarosa.security.BusinessAudit
import com.villarosa.security.CurrentStaff
import com.villarosa.security.StaffAccess
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Sort
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
@Transactional
class CustomerService(
    private val customerRepository: CustomerRepository,
    private val current: CurrentStaff,
    private val access: StaffAccess,
    private val audit: BusinessAudit,
) {

    fun createCustomer(firstName: String, lastName: String, phone: String, address: String): Int {
        val actor = access.lockOwner(current.identity())

        if (listOf(firstName, lastName, phone, address).any { it.isBlank() || it.length > 200 }) {
            throw IllegalArgumentException("All params should have value")
        }

        val existingCustomers =
            customerRepository.findByPropertyIdAndFirstNameAndLastNameAndPhone(
                PropertyScope.ID,
                firstName,
                lastName,
                phone,
            )
        if (existingCustomers.isNotEmpty()) {
            throw ExceptionHandler.ClientException("Customer already exists!")
        }

        val id =
            customerRepository
                .saveAndFlush(Customer.buildCustomer(firstName, lastName, phone, address))
                .id!!
        audit.record(actor.id, "CUSTOMER_CREATED", "CUSTOMER", id.toString())
        return id
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
        require(limit in 1..100) { "Search limit must be between 1 and 100." }
        val page = PageRequest.of(0, limit, Sort.by("firstName", "lastName", "id"))

        if (listOf(firstName, phone).all { it.isNullOrBlank() }) {
            throw ExceptionHandler.ClientException("You must provide at least one parameter!")
        }

        if (!firstName.isNullOrBlank()) {
            val matchedCustomers =
                customerRepository.findByPropertyIdAndFirstNameContaining(
                    PropertyScope.ID,
                    firstName,
                    page,
                )
            if (matchedCustomers.isNotEmpty()) {
                return matchedCustomers
            }
        }

        if (!phone.isNullOrBlank()) {
            val matchedCustomers =
                customerRepository.findByPropertyIdAndPhoneContaining(PropertyScope.ID, phone, page)
            if (matchedCustomers.isNotEmpty()) {
                return matchedCustomers
            }
        }

        return emptyList()
    }
}
