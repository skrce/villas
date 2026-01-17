package com.villarosa.repository

import com.villarosa.repository.model.Customer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.transaction.annotation.Transactional

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@Transactional
class CustomerRepositoryTest @Autowired constructor(
    private val customerRepository: CustomerRepository
) {

    @Test
    fun findByFirstNameAndLastNameAndPhone_matchesExact() {
        customerRepository.save(Customer.buildCustomer("Jane", "Doe", "123", "Main"))

        val results = customerRepository.findByFirstNameAndLastNameAndPhone("Jane", "Doe", "123")

        assertThat(results).hasSize(1)
        assertThat(results[0].firstName).isEqualTo("Jane")
    }

    @Test
    fun findByFirstNameContaining_matchesPartial() {
        customerRepository.save(Customer.buildCustomer("Jane", "Doe", "123", "Main"))
        customerRepository.save(Customer.buildCustomer("John", "Doe", "456", "Main"))

        val results = customerRepository.findByFirstNameContaining("Jan")

        assertThat(results.map { it.firstName }).containsExactly("Jane")
    }

    @Test
    fun findByPhoneContaining_matchesPartial() {
        customerRepository.save(Customer.buildCustomer("Jane", "Doe", "123456", "Main"))
        customerRepository.save(Customer.buildCustomer("John", "Doe", "987654", "Main"))

        val results = customerRepository.findByPhoneContaining("123")

        assertThat(results.map { it.phone }).containsExactly("123456")
    }
}
