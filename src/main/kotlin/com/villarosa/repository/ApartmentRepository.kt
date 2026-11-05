package com.villarosa.repository

import com.villarosa.repository.model.Apartment
import jakarta.persistence.LockModeType
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Query
import org.springframework.stereotype.Repository

@Repository
interface ApartmentRepository : JpaRepository<Apartment, Int> {
    fun findByPropertyId(propertyId: String): List<Apartment>

    fun findByPropertyIdAndId(propertyId: String, id: Int): Apartment?

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from Apartment a where a.propertyId=:property and a.id=:id")
    fun locked(property: String, id: Int): Apartment?
}
