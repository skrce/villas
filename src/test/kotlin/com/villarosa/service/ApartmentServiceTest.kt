package com.villarosa.service

import com.villarosa.repository.ApartmentRepository
import com.villarosa.repository.model.Apartment
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.mockito.Mock
import org.mockito.junit.jupiter.MockitoExtension
import org.mockito.kotlin.whenever
import java.util.Optional

@ExtendWith(MockitoExtension::class)
class ApartmentServiceTest {

    @Mock
    lateinit var apartmentRepository: ApartmentRepository

    private lateinit var apartmentService: ApartmentService

    @BeforeEach
    fun setUp() {
        apartmentService = ApartmentService(apartmentRepository)
    }

    @Test
    fun getAllApartments_returnsRepositoryResults() {
        val apartments = listOf(
            Apartment(1, 2, "South", "Lake", 100, 150),
            Apartment(2, 3, "East", "Garden", 120, 170)
        )
        whenever(apartmentRepository.findAll()).thenReturn(apartments)

        val results = apartmentService.getAllApartments()

        assertThat(results).containsExactly(apartments[0], apartments[1])
    }

    @Test
    fun findApartmentById_returnsNullWhenMissing() {
        whenever(apartmentRepository.findById(2)).thenReturn(Optional.empty())

        val result = apartmentService.findApartmentById(2)

        assertThat(result).isNull()
    }
}
