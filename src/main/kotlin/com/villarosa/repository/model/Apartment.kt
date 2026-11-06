package com.villarosa.repository.model

import com.fasterxml.jackson.annotation.JsonIgnore
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import jakarta.persistence.Version
import java.util.UUID
import org.hibernate.annotations.ColumnDefault

@Entity
@Table(name = "apartments")
data class Apartment(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) val id: Int? = null,
    @Column(name = "capacity", nullable = false) var capacity: Int? = null,
    @Column(name = "orientation") var orientation: String? = null,
    @Column(name = "view") var view: String? = null,
    @Column(name = "regular_price") val regularPrice: Int? = null,
    @Column(name = "top_season_price") val topSeasonPrice: Int? = null,
    @JsonIgnore
    @Column(name = "property_id", nullable = false)
    val propertyId: String = "villa-rosa",
    @Version @Column(nullable = false) var version: Long = 0,
    @Column(nullable = false) var active: Boolean = true,
    @Column(nullable = false, length = 200)
    var name: String =
        listOfNotNull(view, orientation).joinToString(" · ").ifBlank { "Room" }.take(200),
    @Column(nullable = false, length = 32)
    var reference: String =
        "R-${UUID.randomUUID().toString().replace("-", "").take(16).uppercase()}",
    @Column(name = "bed_configuration", length = 200) var bedConfiguration: String? = null,
    @Column(length = 1000) var features: String? = null,
    @Column(length = 50) var floor: String? = null,
    @JsonIgnore @Column(name = "base_rate_cents") var baseRateCents: Long? = null,
    @JsonIgnore
    @ColumnDefault("0")
    @Column(name = "rate_version", nullable = false)
    var rateVersion: Long = 0,
    @JsonIgnore
    @ColumnDefault("'EUR'")
    @Column(name = "rate_currency", nullable = false, length = 3)
    var rateCurrency: String = "EUR",
)
