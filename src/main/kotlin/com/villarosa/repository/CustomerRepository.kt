package com.villarosa.repository

import com.villarosa.repository.model.Customer
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface CustomerRepository : JpaRepository<Customer, Int> {
    fun findByFirstNameAndLastNameAndPhone(
        firstName: String,
        lastName: String,
        phone: String,
    ): List<Customer>

    fun findByFirstNameContaining(firstName: String): List<Customer>

    fun findByPhoneContaining(phone: String): List<Customer>
}
