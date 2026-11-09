package com.villarosa.service

import com.villarosa.repository.ApartmentRepository
import com.villarosa.repository.model.Apartment
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.ActiveProfiles
import org.springframework.transaction.annotation.Transactional

@ActiveProfiles("test")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@Transactional
class ApartmentServiceIntegrationTest
@Autowired
constructor(
    private val apartmentService: ApartmentService,
    private val apartmentRepository: ApartmentRepository,
    private val jdbc: JdbcTemplate,
) {
    @BeforeEach
    fun resetData() {
        com.villarosa.TestData.reset(jdbc)
    }

    @Test
    fun getAllApartments_returnsPersistedApartments() {
        val first =
            apartmentRepository.save(
                Apartment(null, 2, "South", "Lake", 100, 150, propertyId = "villa-rosa")
            )
        val second =
            apartmentRepository.save(
                Apartment(null, 3, "East", "Garden", 120, 170, propertyId = "villa-rosa")
            )

        val results = apartmentService.getAllApartments()

        val ids = results.mapNotNull { it.id }
        assertThat(ids).contains(first.id, second.id)
    }

    @Test
    fun findApartmentById_returnsApartmentWhenExists() {
        val apartment =
            apartmentRepository.save(
                Apartment(null, 2, "South", "Lake", 100, 150, propertyId = "villa-rosa")
            )

        val result = apartmentService.findApartmentById(apartment.id!!)

        assertThat(result).isNotNull
        assertThat(result!!.id).isEqualTo(apartment.id)
    }

    @Test
    fun findApartmentById_returnsNullWhenMissing() {
        val result = apartmentService.findApartmentById(9999)

        assertThat(result).isNull()
    }
}
