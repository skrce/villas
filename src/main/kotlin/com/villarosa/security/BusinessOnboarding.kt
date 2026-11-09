package com.villarosa.security

import com.villarosa.Application
import com.villarosa.PrivateSettings
import com.villarosa.exception.conflict
import com.villarosa.service.PropertyScope
import java.security.MessageDigest
import java.sql.Timestamp
import java.time.Clock
import java.time.temporal.ChronoUnit
import java.util.UUID
import org.springframework.boot.WebApplicationType
import org.springframework.boot.builder.SpringApplicationBuilder
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional

@Service
class BusinessOnboarding(
    private val jdbc: JdbcTemplate,
    private val coordination: IdentityCoordinationRepository,
    private val clock: Clock,
) {
    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    fun create(id: String, suppliedName: String, suppliedEmail: String): InvitationState {
        BusinessIds.requireValid(id)
        val name = PropertyScope.displayName(suppliedName)
        val email = StaffDirectory.email(suppliedEmail)
        val hash =
            MessageDigest.getInstance("SHA-256")
                .digest(listOf(id, name, email).joinToString("\u0000").toByteArray(Charsets.UTF_8))
                .joinToString("") { "%02x".format(it) }
        checkNotNull(coordination.locked())
        val recorded =
            jdbc
                .query(
                    "SELECT request_hash,invitation_id FROM business_onboarding WHERE property_id=?",
                    { rows, _ -> rows.getString(1) to rows.getString(2) },
                    id,
                )
                .singleOrNull()
        if (recorded != null) {
            if (recorded.first != hash)
                conflict(
                    "ONBOARDING_MISMATCH",
                    "This business was initialized with different setup details.",
                )
            return state(id, recorded.second)
        }
        if (
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM businesses WHERE id=?",
                Long::class.java,
                id,
            ) != 0L
        )
            conflict(
                "BUSINESS_ALREADY_EXISTS",
                "Use the existing business's Owner setup or recovery procedure.",
            )
        val now = clock.instant().truncatedTo(ChronoUnit.MICROS)
        val invitation = UUID.randomUUID().toString()
        jdbc.update(
            "INSERT INTO businesses(id,name,created_at) VALUES(?,?,?)",
            id,
            name,
            Timestamp.from(now),
        )
        jdbc.update("INSERT INTO staff_property_lock(property_id) VALUES(?)", id)
        jdbc.update(
            "INSERT INTO staff_invitations(id,property_id,email,state,created_at,expires_at) VALUES(?,?,?,'PENDING',?,?)",
            invitation,
            id,
            email,
            Timestamp.from(now),
            Timestamp.from(now.plus(StaffDirectory.INVITATION_TTL)),
        )
        jdbc.update(
            "INSERT INTO staff_events(property_id,kind,subject_type,subject_id,occurred_at) VALUES(?,'BUSINESS_ONBOARDED','INVITATION',?,?)",
            id,
            invitation,
            Timestamp.from(now),
        )
        jdbc.update(
            "INSERT INTO business_onboarding(property_id,request_hash,invitation_id,created_at) VALUES(?,?,?,?)",
            id,
            hash,
            invitation,
            Timestamp.from(now),
        )
        return InvitationState.PENDING
    }

    private fun state(businessId: String, invitationId: String): InvitationState =
        checkNotNull(
            jdbc.queryForObject(
                "SELECT state,expires_at FROM staff_invitations WHERE property_id=? AND id=?",
                { rows, _ ->
                    val state = InvitationState.valueOf(rows.getString(1))
                    if (
                        state == InvitationState.PENDING &&
                            rows.getTimestamp(2).toInstant() <= clock.instant()
                    )
                        InvitationState.EXPIRED
                    else state
                },
                businessId,
                invitationId,
            )
        )
}

object BusinessOnboardingCommand {
    fun run() {
        val settings = PrivateSettings.resolve()
        fun required(name: String) =
            settings[name]?.takeIf { it.isNotBlank() }
                ?: error("Configure the private business setup inputs.")
        val id = BusinessIds.requireValid(required("VILLAS_NEW_BUSINESS_ID"))
        val name = PropertyScope.displayName(required("VILLAS_NEW_BUSINESS_NAME"))
        val email = StaffDirectory.email(required("VILLAS_INITIAL_OWNER_EMAIL"))
        SpringApplicationBuilder(Application::class.java)
            .web(WebApplicationType.NONE)
            .run("--villas.mode=production")
            .use { context ->
                val state = context.getBean(BusinessOnboarding::class.java).create(id, name, email)
                println("Business onboarding is recorded. Owner invitation status: ${state.name}.")
            }
    }
}
