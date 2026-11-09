package com.villarosa.controller

import com.villarosa.security.CurrentStaff
import com.villarosa.security.StaffAccess
import com.villarosa.security.StaffDirectory
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication
import org.springframework.web.bind.annotation.*

@Tag(name = "Business staff")
@RestController
@RequestMapping("/api/v1/businesses/{businessId}/staff")
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
class BusinessStaffController(
    private val current: CurrentStaff,
    private val access: StaffAccess,
    private val directory: StaffDirectory,
) {
    @GetMapping
    @Operation(
        operationId = "businessStaff",
        summary = "Read Owner memberships in an explicitly authorized business",
    )
    fun accounts(@PathVariable businessId: String) =
        directory.accounts(access.resolve(current.session(), businessId), businessId)

    @GetMapping("/invitations")
    @Operation(
        operationId = "businessStaffInvitations",
        summary = "Read invitations in an explicitly authorized business",
    )
    fun invitations(@PathVariable businessId: String) =
        directory.pendingInvitations(access.resolve(current.session(), businessId), businessId)

    @PostMapping("/invitations")
    @Operation(
        operationId = "inviteBusinessOwner",
        summary = "Invite an Owner to an explicitly authorized business",
    )
    fun invite(@PathVariable businessId: String, @Valid @RequestBody body: InviteOwnerRequest) =
        directory.invite(access.resolve(current.session(), businessId), body.email, businessId)

    @DeleteMapping("/invitations/{invitationId}")
    @Operation(
        operationId = "revokeBusinessInvitation",
        summary = "Revoke an invitation in an explicitly authorized business",
    )
    fun revoke(
        @PathVariable businessId: String,
        @PathVariable invitationId: String,
        @Valid @RequestBody body: StaffVersionRequest,
    ) =
        directory.revokeInvitation(
            access.resolve(current.session(), businessId),
            invitationId,
            body.expectedVersion,
            businessId,
        )

    @PostMapping("/{staffId}/deactivate")
    @Operation(
        operationId = "deactivateBusinessOwner",
        summary = "Deactivate an Owner membership in one business",
    )
    fun deactivate(
        @PathVariable businessId: String,
        @PathVariable staffId: String,
        @Valid @RequestBody body: StaffVersionRequest,
    ) =
        directory.deactivate(
            access.resolve(current.session(), businessId),
            staffId,
            body.expectedVersion,
            businessId,
        )

    @PostMapping("/{staffId}/revoke-sessions")
    @Operation(
        operationId = "revokeBusinessSessions",
        summary = "Revoke existing session grants for one business membership",
    )
    fun revokeSessions(
        @PathVariable businessId: String,
        @PathVariable staffId: String,
        @Valid @RequestBody body: StaffVersionRequest,
    ) =
        directory.revokeSessions(
            access.resolve(current.session(), businessId),
            staffId,
            body.expectedVersion,
            businessId,
        )
}
