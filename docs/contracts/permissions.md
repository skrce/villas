# Staff permissions

The owner confirmed an Owner-only initial release. Every invitation grants Owner
access. Front desk and housekeeping roles are not available. Adding them later
requires an explicit capability decision, server enforcement, and denial tests.

| Capability | Owner |
| --- | --- |
| Read and write the implemented guest and reservation workflows | Allowed |
| Read rooms and manage dated maintenance | Allowed |
| Invite another Owner, revoke invitations, deactivate accounts, revoke sessions | Allowed, with current membership and last-owner protection |
| Read operational and staff audit history | Allowed |
| Future room/rate configuration, payments, refunds, reports | Only after their domain implementation and policy gates |

The account foundation validates current active membership, property scope, and a
security generation in services. Administrative mutations serialize on the property
lock and affected account rows. Two simultaneous deactivations cannot remove every
active owner. Revocation increments the generation so an older session identity is
rejected. Stale account/invitation edits require a reload.

The HTTP boundary requires a current server-side Owner session. Services also check
current membership; business writes lock the Owner row before inventory changes.
Deactivation or revocation committed before that lock prevents the write. A write
already holding the row completes before revocation can commit. Logout invalidates
the server session. Unsafe requests require CSRF and a matching Origin.

First sign-in requires an unexpired invitation matching a verified email exactly
after trimming and case normalization. Dots and plus aliases remain significant.
The resulting canonical account binds the provider issuer and subject. An accepted
invitation cannot reactivate a deactivated account; a new invitation is required.
The same email cannot silently bind a different provider account. A verified email
change for the same subject retains the canonical staff ID and revokes older sessions.

Owner bootstrap is an explicit offline command that creates a pending invitation.
It creates no authenticated account and grants no password or HTTP bypass. See
[security](../security.md). The real Google callback, cookie, logout, recovery, and
invitation checks remain open until demonstrated against Google.

The routed UI shows Owner settings only with `staff:manage`; backend checks remain the
authority. Login-generation changes remount query observers and clear their old cache,
while the same Owner's entered drafts remain above that boundary. An Owner change
creates a new workspace/draft store. Logout hides and clears protected state immediately.
