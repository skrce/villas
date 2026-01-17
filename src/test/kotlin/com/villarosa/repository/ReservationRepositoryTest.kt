package com.villarosa.repository

import com.villarosa.repository.model.Reservation
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.transaction.annotation.Transactional
import java.text.SimpleDateFormat
import java.util.Date

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@Transactional
class ReservationRepositoryTest @Autowired constructor(
    private val reservationRepository: ReservationRepository
) {

    private val dateFormat = SimpleDateFormat("yyyy-MM-dd")

    @Test
    fun findByStartDateBeforeAndEndDateAfter_returnsOverlaps() {
        val reservation1 = reservationRepository.save(
            Reservation(null, 1, 1, date("2020-01-01"), date("2020-01-05"))
        )
        val reservation2 = reservationRepository.save(
            Reservation(null, 1, 2, date("2020-01-05"), date("2020-01-15"))
        )
        val reservation3 = reservationRepository.save(
            Reservation(null, 2, 3, date("2020-01-18"), date("2020-01-25"))
        )

        val results = reservationRepository.findByStartDateBeforeAndEndDateAfter(
            date("2020-01-20"),
            date("2020-01-10")
        )

        assertThat(results.map { it.id }).containsExactlyInAnyOrder(reservation2.id, reservation3.id)
        assertThat(results.map { it.id }).doesNotContain(reservation1.id)
    }

    @Test
    fun findByRoomId_returnsOnlyMatchingRoom() {
        reservationRepository.save(Reservation(null, 1, 1, date("2020-01-01"), date("2020-01-05")))
        reservationRepository.save(Reservation(null, 2, 2, date("2020-01-06"), date("2020-01-07")))

        val results = reservationRepository.findByRoomId(1)

        assertThat(results).hasSize(1)
        assertThat(results[0].roomId).isEqualTo(1)
    }

    @Test
    fun findByCustomerId_returnsOnlyMatchingCustomer() {
        reservationRepository.save(Reservation(null, 1, 1, date("2020-01-01"), date("2020-01-05")))
        reservationRepository.save(Reservation(null, 2, 1, date("2020-01-06"), date("2020-01-07")))

        val results = reservationRepository.findByCustomerId(2)

        assertThat(results).hasSize(1)
        assertThat(results[0].customerId).isEqualTo(2)
    }

    private fun date(value: String): Date = dateFormat.parse(value)
}
