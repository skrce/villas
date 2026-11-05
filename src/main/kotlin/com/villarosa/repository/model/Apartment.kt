package com.villarosa.repository.model

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table

@Entity
@Table(name = "apartments")
data class Apartment(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) val id: Int? = null,
    @Column(name = "capacity") val capacity: Int? = null,
    @Column(name = "orientation") val orientation: String? = null,
    @Column(name = "view") val view: String? = null,
    @Column(name = "regular_price") val regularPrice: Int? = null,
    @Column(name = "top_season_price") val topSeasonPrice: Int? = null,
)
