package com.villarosa.service

import com.villarosa.repository.ApartmentRepository
import com.villarosa.repository.model.Apartment
import com.villarosa.security.CurrentStaff
import com.villarosa.security.StaffAccess
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
@Transactional(readOnly = true)
class ApartmentService(
    private val apartmentRepository: ApartmentRepository,
    private val current: CurrentStaff,
    private val access: StaffAccess,
) {
    fun getAllApartments(): List<Apartment> {
        access.current(current.identity())
        return apartmentRepository.findByPropertyId(PropertyScope.ID)
    }

    fun findApartmentById(id: Int): Apartment? {
        access.current(current.identity())
        return apartmentRepository.findByPropertyIdAndId(PropertyScope.ID, id)
    }
}
