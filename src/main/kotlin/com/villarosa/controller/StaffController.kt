package com.villarosa.controller

import com.villarosa.security.*
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import jakarta.validation.Valid
import jakarta.validation.constraints.Email
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.PositiveOrZero
import jakarta.validation.constraints.Size
import java.time.Instant
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication
import org.springframework.http.ResponseEntity
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler
import org.springframework.security.web.context.DelegatingSecurityContextRepository
import org.springframework.security.web.csrf.CsrfToken
import org.springframework.web.bind.annotation.*

data class SessionView(
    val authenticated: Boolean,
    val staff: StaffView? = null,
    val csrfToken: String? = null,
    val expiresAt: Instant? = null,
    val permissions: List<String> = emptyList(),
    val provider: String = "google",
    val generation: String? = null,
)

data class InviteOwnerRequest(@field:NotBlank @field:Email @field:Size(max = 254) val email: String)

data class StaffVersionRequest(@field:PositiveOrZero val expectedVersion: Long)

@Tag(name = "Staff")
@RestController
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
class StaffController(
    private val current: CurrentStaff,
    private val access: StaffAccess,
    private val directory: StaffDirectory,
    private val contexts: DelegatingSecurityContextRepository,
    private val settings: AuthenticationSettings,
) {
    @GetMapping("/api/v1/auth/session")
    @Operation(operationId = "staffSession", summary = "Read the current server-side staff session")
    fun session(request: HttpServletRequest): SessionView {
        val identity =
            current.optional()
                ?: return SessionView(
                    false,
                    provider = if (settings.synthetic) "synthetic" else "google",
                )
        val account = access.current(identity)
        val authenticatedAt =
            request.getSession(false).getAttribute(StaffSessionFilter.AUTHENTICATED_AT) as Long
        val csrf = request.getAttribute(CsrfToken::class.java.name) as CsrfToken
        return SessionView(
            true,
            account.view(),
            csrf.token,
            Instant.ofEpochMilli(authenticatedAt).plus(AuthenticationSettings.ABSOLUTE_LIMIT),
            listOf(
                "guests:read",
                "guests:write",
                "rooms:read",
                "reservations:read",
                "reservations:write",
                "maintenance:read",
                "maintenance:write",
                "audit:read",
                "staff:manage",
            ),
            if (settings.synthetic) "synthetic" else "google",
            request.getSession(false).getAttribute(StaffSessionFilter.GENERATION) as String,
        )
    }

    @PostMapping("/api/v1/auth/logout")
    @Operation(operationId = "logoutStaff", summary = "Invalidate the current staff session")
    fun logout(request: HttpServletRequest, response: HttpServletResponse): ResponseEntity<Void> {
        current.identity()
        SecurityContextLogoutHandler()
            .apply { setSecurityContextRepository(contexts) }
            .logout(request, response, SecurityContextHolder.getContext().authentication)
        return ResponseEntity.noContent().build()
    }

    @GetMapping("/api/v1/staff")
    @Operation(operationId = "listStaff", summary = "Read Owner accounts")
    fun accounts() = directory.accounts(current.identity())

    @GetMapping("/api/v1/staff/invitations")
    @Operation(operationId = "listStaffInvitations", summary = "Read unexpired Owner invitations")
    fun invitations() = directory.pendingInvitations(current.identity())

    @PostMapping("/api/v1/staff/invitations")
    @Operation(operationId = "inviteOwner", summary = "Invite a Google account as an Owner")
    fun invite(@Valid @RequestBody body: InviteOwnerRequest) =
        directory.invite(current.identity(), body.email)

    @DeleteMapping("/api/v1/staff/invitations/{invitationId}")
    @Operation(operationId = "revokeStaffInvitation", summary = "Revoke an unclaimed invitation")
    fun revoke(@PathVariable invitationId: String, @Valid @RequestBody body: StaffVersionRequest) =
        directory.revokeInvitation(current.identity(), invitationId, body.expectedVersion)

    @PostMapping("/api/v1/staff/{staffId}/deactivate")
    @Operation(
        operationId = "deactivateStaff",
        summary = "Deactivate an Owner while retaining the last active Owner",
    )
    fun deactivate(@PathVariable staffId: String, @Valid @RequestBody body: StaffVersionRequest) =
        directory.deactivate(current.identity(), staffId, body.expectedVersion)

    @PostMapping("/api/v1/staff/{staffId}/revoke-sessions")
    @Operation(
        operationId = "revokeStaffSessions",
        summary = "Invalidate every current session for an Owner",
    )
    fun revokeSessions(
        @PathVariable staffId: String,
        @Valid @RequestBody body: StaffVersionRequest,
    ) = directory.revokeSessions(current.identity(), staffId, body.expectedVersion)
}
