package com.villarosa.security

import com.villarosa.service.PropertyScope
import jakarta.persistence.*
import java.time.Clock
import java.time.Instant
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional

@Component
class BusinessAudit(private val jdbc: JdbcTemplate, private val clock: Clock) {
    @Transactional(propagation = Propagation.MANDATORY)
    fun record(actor: String, kind: String, type: String, id: String) {
        jdbc.update(
            "INSERT INTO business_events (property_id, actor_id, kind, subject_type, subject_id, occurred_at) VALUES (?, ?, ?, ?, ?, ?)",
            PropertyScope.ID,
            actor,
            kind,
            type,
            id,
            clock.instant().atOffset(java.time.ZoneOffset.UTC).toLocalDateTime(),
        )
    }
}

@Entity
@Table(name = "business_events")
class BusinessEvent(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) val id: Long? = null,
    @Column(name = "property_id", nullable = false, length = 64)
    val propertyId: String = PropertyScope.ID,
    @Column(name = "actor_id", nullable = false, length = 36) val actorId: String = "",
    @Column(nullable = false, length = 32) val kind: String = "",
    @Column(name = "subject_type", nullable = false, length = 32) val subjectType: String = "",
    @Column(name = "subject_id", nullable = false, length = 36) val subjectId: String = "",
    @Column(name = "occurred_at", nullable = false) val occurredAt: Instant = Instant.now(),
)
