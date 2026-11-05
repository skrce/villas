package com.villarosa.service

import com.villarosa.repository.ApartmentRepository
import com.villarosa.repository.model.Apartment
import org.springframework.stereotype.Service

@Service
class ApartmentService(private val apartmentRepository: ApartmentRepository) {
    fun getAllApartments(): List<Apartment> = apartmentRepository.findAll()

    fun findApartmentById(id: Int): Apartment? = apartmentRepository.findById(id).orElse(null)
}
