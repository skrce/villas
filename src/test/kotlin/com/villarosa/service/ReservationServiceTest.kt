package com.villarosa.service

import com.villarosa.exception.ExceptionHandler
import com.villarosa.repository.ReservationRepository
import com.villarosa.repository.model.Apartment
import com.villarosa.repository.model.Customer
import com.villarosa.repository.model.Reservation
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
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Optional

@ExtendWith(MockitoExtension::class)
class ReservationServiceTest {

    @Mock
    lateinit var reservationRepository: ReservationRepository

    @Mock
    lateinit var apartmentService: ApartmentService

    @Mock
    lateinit var customerService: CustomerService

    private lateinit var reservationService: ReservationService

    private val dateFormat = SimpleDateFormat("yyyy-MM-dd")

    @BeforeEach
    fun setUp() {
        reservationService = ReservationService(reservationRepository, apartmentService, customerService)
    }

    @Test
    fun createReservation_throwsWhenDatesEmpty() {
        val exception = assertThrows<IllegalArgumentException> {
            reservationService.createReservation(1, 1, "", "2020-01-01")
        }

        assertThat(exception.message).isEqualTo("Dates should not be empty")
    }

    @Test
    fun createReservation_throwsOnInvalidDateFormat() {
        val exception = assertThrows<ExceptionHandler.ClientException> {
            reservationService.createReservation(1, 1, "2020/01/01", "2020-01-10")
        }

        assertThat(exception.message).isEqualTo("Date should have format: yyyy-MM-dd")
    }

    @Test
    fun createReservation_throwsWhenStartAfterEnd() {
        val exception = assertThrows<ExceptionHandler.ClientException> {
            reservationService.createReservation(1, 1, "2020-02-01", "2020-01-01")
        }

        assertThat(exception.message).isEqualTo("StartDate can't be after EndDate")
    }

    @Test
    fun createReservation_throwsWhenCustomerMissing() {
        whenever(customerService.findCustomerById(1)).thenReturn(Optional.empty())

        val exception = assertThrows<ExceptionHandler.ClientException> {
            reservationService.createReservation(1, 1, "2020-01-01", "2020-01-10")
        }

        assertThat(exception.message).isEqualTo("Customer does not exist!")
    }

    @Test
    fun createReservation_throwsWhenOverlappingReservationExists() {
        whenever(customerService.findCustomerById(1))
            .thenReturn(Optional.of(Customer(1, "Jane", "Doe", "123", "Main")))
        whenever(reservationRepository.findByRoomId(1))
            .thenReturn(listOf(
                Reservation(1, 1, 1, date("2020-01-03"), date("2020-01-06"))
            ))

        val exception = assertThrows<ExceptionHandler.ClientException> {
            reservationService.createReservation(1, 1, "2020-01-01", "2020-01-10")
        }

        assertThat(exception.message).contains("Existing overlapping reservations exists:")
    }

    @Test
    fun createReservation_savesAndReturnsId() {
        whenever(customerService.findCustomerById(1))
            .thenReturn(Optional.of(Customer(1, "Jane", "Doe", "123", "Main")))
        whenever(reservationRepository.findByRoomId(1)).thenReturn(emptyList())
        doReturn(Reservation(55, 1, 1, date("2020-01-01"), date("2020-01-05")))
            .whenever(reservationRepository)
            .save(any())

        val id = reservationService.createReservation(1, 1, "2020-01-01", "2020-01-05")

        assertThat(id).isEqualTo(55)
        val captor = argumentCaptor<Reservation>()
        verify(reservationRepository).save(captor.capture())
        assertThat(captor.firstValue.customerId).isEqualTo(1)
        assertThat(captor.firstValue.roomId).isEqualTo(1)
        assertThat(captor.firstValue.startDate).isEqualTo(date("2020-01-01"))
        assertThat(captor.firstValue.endDate).isEqualTo(date("2020-01-05"))
    }

    @Test
    fun findAvailableApartments_throwsWhenStartAfterEnd() {
        val exception = assertThrows<ExceptionHandler.ClientException> {
            reservationService.findAvailableApartments("2020-02-01", "2020-01-01")
        }

        assertThat(exception.message).isEqualTo("StartDate can't be after EndDate")
    }

    @Test
    fun findAvailableApartments_filtersOverlappingReservations() {
        val apartment1 = Apartment(1, 2, "South", "Lake", 100, 150)
        val apartment2 = Apartment(2, 2, "South", "Lake", 100, 150)
        val apartment3 = Apartment(3, 2, "South", "Lake", 100, 150)
        whenever(apartmentService.getAllApartments())
            .thenReturn(listOf(apartment1, apartment2, apartment3))
        whenever(reservationRepository.findByStartDateBeforeAndEndDateAfter(date("2020-01-10"), date("2020-01-01")))
            .thenReturn(listOf(
                Reservation(1, 1, 2, date("2020-01-03"), date("2020-01-05")),
                Reservation(2, 1, 3, date("2020-02-01"), date("2020-02-05"))
            ))

        val available = reservationService.findAvailableApartments("2020-01-01", "2020-01-10")

        assertThat(available.map { it.id }).containsExactly(1, 3)
    }

    @Test
    fun cancelReservation_throwsWhenMissing() {
        whenever(reservationRepository.findById(10)).thenReturn(Optional.empty())

        val exception = assertThrows<ExceptionHandler.ClientException> {
            reservationService.cancelReservation(10)
        }

        assertThat(exception.message).isEqualTo("Reservation does not exist.")
    }

    @Test
    fun cancelReservation_deletesExistingReservation() {
        val reservation = Reservation(1, 1, 1, date("2020-01-01"), date("2020-01-05"))
        whenever(reservationRepository.findById(1)).thenReturn(Optional.of(reservation))

        reservationService.cancelReservation(1)

        verify(reservationRepository).delete(reservation)
    }

    @Test
    fun updateReservationRoom_throwsWhenReservationMissing() {
        whenever(reservationRepository.findById(1)).thenReturn(Optional.empty())

        val exception = assertThrows<ExceptionHandler.ClientException> {
            reservationService.updateReservationRoom(1, 2)
        }

        assertThat(exception.message).isEqualTo("Reservation does not exist.")
    }

    @Test
    fun updateReservationRoom_throwsWhenRoomMissing() {
        val reservation = Reservation(1, 1, 1, date("2020-01-01"), date("2020-01-05"))
        whenever(reservationRepository.findById(1)).thenReturn(Optional.of(reservation))
        whenever(apartmentService.findApartmentById(2)).thenReturn(null)

        val exception = assertThrows<ExceptionHandler.ClientException> {
            reservationService.updateReservationRoom(1, 2)
        }

        assertThat(exception.message).isEqualTo("Room does not exist.")
    }

    @Test
    fun updateReservationRoom_throwsWhenNewRoomHasOverlap() {
        val reservation = Reservation(1, 1, 1, date("2020-01-01"), date("2020-01-05"))
        whenever(reservationRepository.findById(1)).thenReturn(Optional.of(reservation))
        whenever(apartmentService.findApartmentById(2)).thenReturn(Apartment(2, 2, "South", "Lake", 100, 150))
        whenever(reservationRepository.findByRoomId(2)).thenReturn(
            listOf(Reservation(2, 2, 2, date("2020-01-03"), date("2020-01-06")))
        )

        val exception = assertThrows<ExceptionHandler.ClientException> {
            reservationService.updateReservationRoom(1, 2)
        }

        assertThat(exception.message).contains("New room has overlapping reservation:")
    }

    @Test
    fun updateReservationRoom_updatesRoomWhenAvailable() {
        val reservation = Reservation(1, 1, 1, date("2020-01-01"), date("2020-01-05"))
        whenever(reservationRepository.findById(1)).thenReturn(Optional.of(reservation))
        whenever(apartmentService.findApartmentById(2)).thenReturn(Apartment(2, 2, "South", "Lake", 100, 150))
        whenever(reservationRepository.findByRoomId(2)).thenReturn(emptyList())

        reservationService.updateReservationRoom(1, 2)

        val captor = argumentCaptor<Reservation>()
        verify(reservationRepository).save(captor.capture())
        assertThat(captor.firstValue.id).isEqualTo(1)
        assertThat(captor.firstValue.roomId).isEqualTo(2)
        assertThat(captor.firstValue.customerId).isEqualTo(1)
    }

    @Test
    fun findReservationsByCustomer_sortedByStartDateDescending() {
        whenever(reservationRepository.findByCustomerId(1)).thenReturn(
            listOf(
                Reservation(1, 1, 1, date("2020-01-01"), date("2020-01-05")),
                Reservation(2, 1, 1, date("2020-03-01"), date("2020-03-05")),
                Reservation(3, 1, 1, date("2020-02-01"), date("2020-02-05"))
            )
        )

        val results = reservationService.findReservationsByCustomer(1)

        assertThat(results.map { it.startDate }).containsExactly("2020-03-01", "2020-02-01", "2020-01-01")
    }

    private fun date(value: String): Date = dateFormat.parse(value)
}
