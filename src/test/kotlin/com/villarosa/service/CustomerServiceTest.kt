package com.villarosa.service

import com.villarosa.exception.ExceptionHandler
import com.villarosa.repository.CustomerRepository
import com.villarosa.repository.model.Customer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.api.extension.ExtendWith
import org.mockito.Mock
import org.mockito.junit.jupiter.MockitoExtension
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

@ExtendWith(MockitoExtension::class)
class CustomerServiceTest {

    @Mock
    lateinit var customerRepository: CustomerRepository

    private lateinit var customerService: CustomerService

    @BeforeEach
    fun setUp() {
        customerService = CustomerService(customerRepository)
    }

    @Test
    fun createCustomer_throwsWhenAnyParamEmpty() {
        val exception = assertThrows<IllegalArgumentException> {
            customerService.createCustomer("", "Doe", "123", "Main")
        }

        assertThat(exception.message).isEqualTo("All params should have value")
    }

    @Test
    fun createCustomer_throwsWhenCustomerExists() {
        whenever(customerRepository.findByFirstNameAndLastNameAndPhone("Jane", "Doe", "123"))
            .thenReturn(listOf(Customer(1, "Jane", "Doe", "123", "Main")))

        val exception = assertThrows<ExceptionHandler.ClientException> {
            customerService.createCustomer("Jane", "Doe", "123", "Main")
        }

        assertThat(exception.message).isEqualTo("Customer already exists!")
    }

    @Test
    fun createCustomer_savesAndReturnsId() {
        whenever(customerRepository.findByFirstNameAndLastNameAndPhone("Jane", "Doe", "123"))
            .thenReturn(emptyList())
        doReturn(Customer(42, "Jane", "Doe", "123", "Main"))
            .whenever(customerRepository)
            .save(any())

        val id = customerService.createCustomer("Jane", "Doe", "123", "Main")

        assertThat(id).isEqualTo(42)
        val captor = argumentCaptor<Customer>()
        verify(customerRepository).save(captor.capture())
        assertThat(captor.firstValue.firstName).isEqualTo("Jane")
        assertThat(captor.firstValue.lastName).isEqualTo("Doe")
        assertThat(captor.firstValue.phone).isEqualTo("123")
        assertThat(captor.firstValue.address).isEqualTo("Main")
    }

    @Test
    fun searchCustomer_throwsWhenNoParams() {
        val exception = assertThrows<ExceptionHandler.ClientException> {
            customerService.searchCustomer(null, null)
        }

        assertThat(exception.message).isEqualTo("You must provide at least one parameter!")
    }

    @Test
    fun searchCustomer_returnsMatchesByFirstName() {
        val customer = Customer(1, "Jane", "Doe", "123", "Main")
        whenever(customerRepository.findByFirstNameContaining("Jan"))
            .thenReturn(listOf(customer))

        val results = customerService.searchCustomer("Jan", null)

        assertThat(results).containsExactly(customer)
    }

    @Test
    fun searchCustomer_fallsBackToPhoneWhenFirstNameEmpty() {
        val customer = Customer(1, "Jane", "Doe", "123", "Main")
        whenever(customerRepository.findByFirstNameContaining("Jan"))
            .thenReturn(emptyList())
        whenever(customerRepository.findByPhoneContaining("123"))
            .thenReturn(listOf(customer))

        val results = customerService.searchCustomer("Jan", "123")

        assertThat(results).containsExactly(customer)
    }

    @Test
    fun searchCustomer_returnsEmptyWhenNoMatches() {
        whenever(customerRepository.findByFirstNameContaining("Jan"))
            .thenReturn(emptyList())
        whenever(customerRepository.findByPhoneContaining("123"))
            .thenReturn(emptyList())

        val results = customerService.searchCustomer("Jan", "123")

        assertThat(results).isEmpty()
    }
}
