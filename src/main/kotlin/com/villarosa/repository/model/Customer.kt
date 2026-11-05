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
    @Column(name = "first_name", nullable = false) val firstName: String? = null,
    @Column(name = "last_name", nullable = false) val lastName: String? = null,
    @Column(name = "phone", nullable = false) val phone: String? = null,
    @Column(name = "address", nullable = false) val address: String? = null,
    @JsonIgnore
    @Column(name = "property_id", nullable = false)
    val propertyId: String = "villa-rosa",
    @Version @Column(nullable = false) var version: Long = 0,
) {
    companion object {
        fun buildCustomer(firstName: String, lastName: String, phone: String, address: String) =
            Customer(null, firstName, lastName, phone, address)
    }
}
