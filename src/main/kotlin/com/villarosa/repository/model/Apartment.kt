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
@Table(name = "apartments")
data class Apartment(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) val id: Int? = null,
    @Column(name = "capacity", nullable = false) val capacity: Int? = null,
    @Column(name = "orientation") val orientation: String? = null,
    @Column(name = "view") val view: String? = null,
    @Column(name = "regular_price") val regularPrice: Int? = null,
    @Column(name = "top_season_price") val topSeasonPrice: Int? = null,
    @JsonIgnore
    @Column(name = "property_id", nullable = false)
    val propertyId: String = "villa-rosa",
    @Version @Column(nullable = false) var version: Long = 0,
    @Column(nullable = false) var active: Boolean = true,
)
