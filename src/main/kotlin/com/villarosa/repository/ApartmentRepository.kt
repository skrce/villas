package com.villarosa.repository

import com.villarosa.repository.model.Apartment
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository interface ApartmentRepository : JpaRepository<Apartment, Int> {}
