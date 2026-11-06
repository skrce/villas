package com.villarosa.service

import com.villarosa.exception.DomainException
import com.villarosa.exception.ExceptionHandler
import com.villarosa.repository.CustomerRepository
import com.villarosa.repository.model.Customer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.ActiveProfiles
import org.springframework.transaction.annotation.Transactional

@ActiveProfiles("test")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@Transactional
class CustomerServiceIntegrationTest
@Autowired
constructor(
    private val customerService: CustomerService,
    private val customerRepository: CustomerRepository,
    private val jdbc: JdbcTemplate,
) {
    @BeforeEach
    fun resetData() {
        com.villarosa.TestData.reset(jdbc)
    }

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
        val exception =
            assertThrows<DomainException> {
                customerService.createCustomer("", "Doe", "123", "Main")
            }

        assertThat(exception.code).isEqualTo("INVALID_GUEST")
    }

    @Test
    fun createCustomer_throwsWhenDuplicate() {
        customerService.createCustomer("Jane", "Doe", "123", "Main")

        val exception =
            assertThrows<DomainException> {
                customerService.createCustomer("Jane", "Doe", "123", "Main")
            }

        assertThat(exception.code).isEqualTo("POSSIBLE_DUPLICATE")
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
    fun searchCustomer_combinesNameAndPhoneRatherThanFallingBack() {
        customerRepository.save(Customer.buildCustomer("Jane", "Doe", "123", "Main"))
        customerRepository.save(Customer.buildCustomer("John", "Doe", "456", "Other"))

        val results = customerService.searchCustomer("Nope", "123")

        assertThat(results).isEmpty()
    }

    @Test
    fun searchCustomer_returnsEmptyWhenNoMatches() {
        customerRepository.save(Customer.buildCustomer("Jane", "Doe", "123", "Main"))

        val results = customerService.searchCustomer("Nope", null)

        assertThat(results).isEmpty()
    }

    @Test
    fun searchCustomer_throwsWhenNoParams() {
        val exception =
            assertThrows<ExceptionHandler.ClientException> {
                customerService.searchCustomer(null, null)
            }

        assertThat(exception.message).isEqualTo("You must provide at least one parameter!")
    }
}
