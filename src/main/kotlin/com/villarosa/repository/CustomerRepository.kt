package com.villarosa.repository

import com.villarosa.repository.model.Customer
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface CustomerRepository : JpaRepository<Customer, Int> {
    fun findByPropertyIdAndId(propertyId: String, id: Int): Customer?

    fun findByPropertyIdAndFirstNameContaining(
        propertyId: String,
        firstName: String,
        pageable: Pageable,
    ): List<Customer>

    fun findByPropertyIdAndPhoneContaining(
        propertyId: String,
        phone: String,
        pageable: Pageable,
    ): List<Customer>

    fun findByPropertyIdAndFirstNameAndLastNameAndPhone(
        propertyId: String,
        firstName: String,
        lastName: String,
        phone: String,
    ): List<Customer>

    fun findByFirstNameAndLastNameAndPhone(
        firstName: String,
        lastName: String,
        phone: String,
    ): List<Customer>

    fun findByFirstNameContaining(firstName: String): List<Customer>

    fun findByPhoneContaining(phone: String): List<Customer>
}
