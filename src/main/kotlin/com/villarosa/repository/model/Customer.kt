package com.villarosa.repository.model

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table

@Entity
@Table(name = "customers")
data class Customer(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) val id: Int? = null,
    @Column(name = "first_name") val firstName: String? = null,
    @Column(name = "last_name") val lastName: String? = null,
    @Column(name = "phone") val phone: String? = null,
    @Column(name = "address") val address: String? = null,
) {
    companion object {
        fun buildCustomer(firstName: String, lastName: String, phone: String, address: String) =
            Customer(null, firstName, lastName, phone, address)
    }
}
