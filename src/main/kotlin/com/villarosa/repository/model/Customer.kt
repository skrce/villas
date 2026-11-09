package com.villarosa.repository.model

import com.fasterxml.jackson.annotation.JsonIgnore
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import jakarta.persistence.Version

@Entity
@Table(name = "customers")
data class Customer(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) val id: Int? = null,
    @Column(name = "first_name", nullable = false, length = 200) var firstName: String? = null,
    @Column(name = "last_name", nullable = false, length = 200) var lastName: String? = null,
    @Column(name = "phone", length = 200) var phone: String? = null,
    @Column(name = "address", length = 500) var address: String? = null,
    @JsonIgnore @Column(name = "property_id", nullable = false) val propertyId: String,
    @Version @Column(nullable = false) var version: Long = 0,
    @Column(length = 254) var email: String? = null,
    @Column(length = 2000) var notes: String? = null,
    @Column(nullable = false) var active: Boolean = true,
) {
    companion object {
        fun buildCustomer(
            firstName: String,
            lastName: String,
            phone: String,
            address: String,
            businessId: String,
        ) = Customer(null, firstName, lastName, phone, address, propertyId = businessId)
    }
}
