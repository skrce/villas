package com.villarosa.service

import com.villarosa.exception.ExceptionHandler
import com.villarosa.repository.CustomerRepository
import com.villarosa.repository.model.Customer
import org.springframework.stereotype.Service

@Service
class CustomerService(private val customerRepository: CustomerRepository) {

    fun createCustomer(firstName: String, lastName: String, phone: String, address: String): Int {

        if (listOf(firstName, lastName, phone, address).any { it.isEmpty() }) {
            throw IllegalArgumentException("All params should have value")
        }

        val existingCustomers =
            customerRepository.findByFirstNameAndLastNameAndPhone(firstName, lastName, phone)
        if (existingCustomers.isNotEmpty()) {
            throw ExceptionHandler.ClientException("Customer already exists!")
        }

        return customerRepository
            .save(Customer.buildCustomer(firstName, lastName, phone, address))
            .id!!
    }

    fun findCustomerById(id: Int) = customerRepository.findById(id)

    fun searchCustomer(firstName: String?, phone: String?): List<Customer> {

        if (listOf(firstName, phone).all { it == null }) {
            throw ExceptionHandler.ClientException("You must provide at least one parameter!")
        }

        if (firstName != null) {
            val matchedCustomers = customerRepository.findByFirstNameContaining(firstName)
            if (matchedCustomers.isNotEmpty()) {
                return matchedCustomers
            }
        }

        if (phone != null) {
            val matchedCustomers = customerRepository.findByPhoneContaining(phone)
            if (matchedCustomers.isNotEmpty()) {
                return matchedCustomers
            }
        }

        return emptyList()
    }
}
