package com.villarosa.service

import com.villarosa.exception.ExceptionHandler
import com.villarosa.repository.CustomerRepository
import com.villarosa.repository.model.Customer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.transaction.annotation.Transactional

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@Transactional
class CustomerServiceIntegrationTest @Autowired constructor(
    private val customerService: CustomerService,
    private val customerRepository: CustomerRepository
) {

    @Test
    fun createCustomer_persistsAndReturnsId() {
        val id = customerService.createCustomer("Jane", "Doe", "123", "Main")

        val saved = customerRepository.findById(id).orElse(null)
        assertThat(saved).isNotNull
        assertThat(saved!!.firstName).isEqualTo("Jane")
        assertThat(saved.lastName).isEqualTo("Doe")
        assertThat(saved.phone).isEqualTo("123")
        assertThat(saved.address).isEqualTo("Main")
    }

    @Test
    fun createCustomer_throwsWhenParamEmpty() {
        val exception = assertThrows<IllegalArgumentException> {
            customerService.createCustomer("", "Doe", "123", "Main")
        }

        assertThat(exception.message).isEqualTo("All params should have value")
    }

    @Test
    fun createCustomer_throwsWhenDuplicate() {
        customerService.createCustomer("Jane", "Doe", "123", "Main")

        val exception = assertThrows<ExceptionHandler.ClientException> {
            customerService.createCustomer("Jane", "Doe", "123", "Main")
        }

        assertThat(exception.message).isEqualTo("Customer already exists!")
    }

    @Test
    fun searchCustomer_returnsMatchesByFirstName() {
        customerRepository.save(Customer.buildCustomer("Jane", "Doe", "123", "Main"))
        customerRepository.save(Customer.buildCustomer("John", "Doe", "456", "Other"))

        val results = customerService.searchCustomer("Jan", null)

        assertThat(results).hasSize(1)
        assertThat(results[0].firstName).isEqualTo("Jane")
    }

    @Test
    fun searchCustomer_fallsBackToPhoneWhenFirstNameMisses() {
        customerRepository.save(Customer.buildCustomer("Jane", "Doe", "123", "Main"))
        customerRepository.save(Customer.buildCustomer("John", "Doe", "456", "Other"))

        val results = customerService.searchCustomer("Nope", "123")

        assertThat(results).hasSize(1)
        assertThat(results[0].phone).isEqualTo("123")
    }

    @Test
    fun searchCustomer_returnsEmptyWhenNoMatches() {
        customerRepository.save(Customer.buildCustomer("Jane", "Doe", "123", "Main"))

        val results = customerService.searchCustomer("Nope", null)

        assertThat(results).isEmpty()
    }

    @Test
    fun searchCustomer_throwsWhenNoParams() {
        val exception = assertThrows<ExceptionHandler.ClientException> {
            customerService.searchCustomer(null, null)
        }

        assertThat(exception.message).isEqualTo("You must provide at least one parameter!")
    }
}
