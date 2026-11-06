package com.villarosa.service

import com.villarosa.exception.ExceptionHandler
import com.villarosa.repository.ApartmentRepository
import com.villarosa.repository.CustomerRepository
import com.villarosa.repository.ReservationRepository
import com.villarosa.repository.model.Apartment
import com.villarosa.repository.model.Customer
import com.villarosa.repository.model.Reservation
import java.time.LocalDate
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.ActiveProfiles

@ActiveProfiles("test")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class ReservationServiceIntegrationTest
@Autowired
constructor(
    private val reservationService: ReservationService,
    private val quotes: QuoteService,
    private val reservationRepository: ReservationRepository,
    private val apartmentRepository: ApartmentRepository,
    private val customerRepository: CustomerRepository,
    private val jdbc: JdbcTemplate,
) {
    @BeforeEach
    fun resetData() {
        com.villarosa.TestData.reset(jdbc)
    }

    @Test
    fun createReservation_persistsAndReturnsId() {
        val customer = saveCustomer()
        val apartment = saveApartment()

        val reservationId =
            reservationService.createReservation(
                customer.id!!,
                apartment.id!!,
                "2020-01-01",
                "2020-01-05",
                quotes.create(apartment.id!!, "2020-01-01", "2020-01-05", 1).id,
            )

        val saved = reservationRepository.findById(reservationId).orElse(null)
        assertThat(saved).isNotNull
        assertThat(saved!!.customerId).isEqualTo(customer.id)
        assertThat(saved.roomId).isEqualTo(apartment.id)
        assertThat(saved.startDate.toString()).isEqualTo("2020-01-01")
        assertThat(saved.endDate.toString()).isEqualTo("2020-01-05")
    }

    @Test
    fun createReservation_throwsWhenDatesEmpty() {
        val customer = saveCustomer()
        val apartment = saveApartment()

        val exception =
            assertThrows<IllegalArgumentException> {
                reservationService.createReservation(
                    customer.id!!,
                    apartment.id!!,
                    "",
                    "2020-01-05",
                )
            }

        assertThat(exception.message).isEqualTo("Dates should not be empty")
    }

    @Test
    fun createReservation_throwsOnInvalidDateFormat() {
        val customer = saveCustomer()
        val apartment = saveApartment()

        val exception =
            assertThrows<ExceptionHandler.ClientException> {
                reservationService.createReservation(
                    customer.id!!,
                    apartment.id!!,
                    "2020/01/01",
                    "2020-01-05",
                )
            }

        assertThat(exception.message).isEqualTo("Date should have format: yyyy-MM-dd")
    }

    @Test
    fun createReservation_throwsWhenStartAfterEnd() {
        val exception =
            assertThrows<ExceptionHandler.ClientException> {
                reservationService.createReservation(9999, 9999, "2020-02-01", "2020-01-01")
            }

        assertThat(exception.message).isEqualTo("Checkout must be after check-in.")
    }

    @Test
    fun createReservation_throwsWhenCustomerMissing() {
        val apartment = saveApartment()

        val exception =
            assertThrows<com.villarosa.exception.DomainException> {
                reservationService.createReservation(
                    9999,
                    apartment.id!!,
                    "2020-01-01",
                    "2020-01-05",
                )
            }

        assertThat(exception.message).isEqualTo("Guest does not exist.")
    }

    @Test
    fun createReservation_throwsWhenOverlappingReservationExists() {
        val customer = saveCustomer()
        val apartment = saveApartment()
        reservationRepository.save(
            Reservation(null, customer.id, apartment.id, date("2020-01-03"), date("2020-01-06"))
        )

        val exception =
            assertThrows<com.villarosa.exception.DomainException> {
                reservationService.createReservation(
                    customer.id!!,
                    apartment.id!!,
                    "2020-01-01",
                    "2020-01-10",
                )
            }

        assertThat(exception.message).contains("The room is unavailable for those dates.")
    }

    @Test
    fun findAvailableApartments_filtersOverlappingReservations() {
        val customer = saveCustomer()
        val apartment1 = saveApartment()
        val apartment2 = saveApartment()
        val apartment3 = saveApartment()
        reservationRepository.save(
            Reservation(null, customer.id, apartment2.id, date("2020-01-03"), date("2020-01-06"))
        )
        reservationRepository.save(
            Reservation(null, customer.id, apartment3.id, date("2020-02-01"), date("2020-02-05"))
        )

        val available = reservationService.findAvailableApartments("2020-01-01", "2020-01-10")

        val ids = available.mapNotNull { it.id }
        assertThat(ids).contains(apartment1.id, apartment3.id)
        assertThat(ids).doesNotContain(apartment2.id)
    }

    @Test
    fun findAvailableApartments_throwsOnInvalidDateFormat() {
        val exception =
            assertThrows<ExceptionHandler.ClientException> {
                reservationService.findAvailableApartments("2020/01/01", "2020-01-10")
            }

        assertThat(exception.message).isEqualTo("Date should have format: yyyy-MM-dd")
    }

    @Test
    fun findAvailableApartments_throwsWhenStartAfterEnd() {
        val exception =
            assertThrows<ExceptionHandler.ClientException> {
                reservationService.findAvailableApartments("2020-02-01", "2020-01-01")
            }

        assertThat(exception.message).isEqualTo("Checkout must be after check-in.")
    }

    @Test
    fun cancelReservation_retainsTheCancelledReservation() {
        val customer = saveCustomer()
        val apartment = saveApartment()
        val reservation =
            reservationRepository.save(
                Reservation(null, customer.id, apartment.id, date("2020-01-01"), date("2020-01-05"))
            )

        reservationService.cancelReservation(reservation.id!!)

        assertThat(reservationRepository.findById(reservation.id!!).get().status)
            .isEqualTo(com.villarosa.repository.model.ReservationStatus.CANCELLED)
    }

    @Test
    fun cancelReservation_throwsWhenMissing() {
        val exception =
            assertThrows<com.villarosa.exception.DomainException> {
                reservationService.cancelReservation(9999)
            }

        assertThat(exception.message).isEqualTo("Reservation does not exist.")
    }

    @Test
    fun updateReservationRoom_updatesWhenAvailable() {
        val customer = saveCustomer()
        val apartment1 = saveApartment()
        val apartment2 = saveApartment()
        val reservation =
            reservationRepository.save(
                Reservation(
                    null,
                    customer.id,
                    apartment1.id,
                    date("2020-01-01"),
                    date("2020-01-05"),
                )
            )

        reservationService.updateReservationRoom(
            reservation.id!!,
            apartment2.id!!,
            quotes.create(apartment2.id!!, "2020-01-01", "2020-01-05", 1).id,
        )

        val updated = reservationRepository.findById(reservation.id!!).orElse(null)
        assertThat(updated).isNotNull
        assertThat(updated!!.roomId).isEqualTo(apartment2.id)
    }

    @Test
    fun updateReservationRoom_throwsWhenNewRoomHasOverlap() {
        val customer = saveCustomer()
        val apartment1 = saveApartment()
        val apartment2 = saveApartment()
        val reservation =
            reservationRepository.save(
                Reservation(
                    null,
                    customer.id,
                    apartment1.id,
                    date("2020-01-01"),
                    date("2020-01-05"),
                )
            )
        reservationRepository.save(
            Reservation(null, customer.id, apartment2.id, date("2020-01-03"), date("2020-01-06"))
        )

        val exception =
            assertThrows<com.villarosa.exception.DomainException> {
                reservationService.updateReservationRoom(
                    reservation.id!!,
                    apartment2.id!!,
                    quotes.create(apartment2.id!!, "2020-01-01", "2020-01-05", 1).id,
                )
            }

        assertThat(exception.message).contains("The room is unavailable for those dates.")
    }

    @Test
    fun findReservationsByCustomer_sortedByStartDateDescending() {
        val customer = saveCustomer()
        val apartment = saveApartment()
        reservationRepository.save(
            Reservation(null, customer.id, apartment.id, date("2020-01-01"), date("2020-01-05"))
        )
        reservationRepository.save(
            Reservation(null, customer.id, apartment.id, date("2020-03-01"), date("2020-03-05"))
        )
        reservationRepository.save(
            Reservation(null, customer.id, apartment.id, date("2020-02-01"), date("2020-02-05"))
        )

        val results = reservationService.findReservationsByCustomer(customer.id!!)

        assertThat(results.map { it.startDate })
            .containsExactly("2020-03-01", "2020-02-01", "2020-01-01")
    }

    private fun saveCustomer(
        firstName: String = "Jane",
        lastName: String = "Doe",
        phone: String = "123",
        address: String = "Main",
    ): Customer =
        customerRepository.save(Customer.buildCustomer(firstName, lastName, phone, address))

    private fun saveApartment(
        capacity: Int = 2,
        orientation: String = "South",
        view: String = "Lake",
        regularPrice: Int = 100,
        topSeasonPrice: Int = 150,
    ): Apartment =
        apartmentRepository.save(
            Apartment(
                null,
                capacity,
                orientation,
                view,
                regularPrice,
                topSeasonPrice,
                baseRateCents = 5001,
                rateVersion = 1,
            )
        )

    private fun date(value: String): LocalDate = LocalDate.parse(value)
}
