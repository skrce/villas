# Staff security

The initial release supports Owners only, as confirmed by the owner. All new staff
invitations grant full Owner access. Sessions have a seven-day absolute limit
and a three-day inactivity limit. Staff identity is separate from guest records.

The approved shared app will separate Google identity from independent business
memberships under [#45](https://github.com/skrce/villas/issues/45). The implementation
below still serves one configured business. It does not yet provide shared login,
business switching or database row security. Read [the tenancy contract](contracts/multi-tenancy.md)
for the ordered conversion and authorization requirements.

## Account foundation

V5 adds property-scoped accounts, invitations, and staff events. It inserts one
coordination row, with no owner account or invitation. Administrative changes lock
that row before reading current membership or the number of active owners. They
write their audit event in the same transaction. Actor and subject IDs are recorded;
emails, provider tokens, and complete guest records are not copied into audit events.

An invitation expires after three days and can be consumed once by the exact verified
email, normalized only for case and surrounding whitespace. Creating the invitation
does not send an email. The owner can tell the invitee to visit Villas and sign in.
An inactive account needs a new invitation before it can be reactivated. Current
security generations invalidate identities issued before revocation or deactivation.

Canonical staff IDs are random UUIDs. Provider issuer and subject identify the Google
account after validation. Email is an invitation match and contact field. Google's
subject remains stable when its email changes. A verified rename keeps the staff ID
and increments its security generation. [Google OIDC documentation](https://developers.google.com/identity/openid-connect/openid-connect).

## Initial owner setup

First migrate the checkout's private database and build the packaged application.
Put `VILLAS_INITIAL_OWNER_EMAIL` in the ignored `.env.local` configuration, then run:

```sh
node scripts/run-api.mjs --bootstrap-owner
```

This starts no HTTP listener. It creates a pending invitation only if there are no
staff accounts. A repeat with the same email returns the existing unexpired
invitation. A different email is refused while one is pending. To correct an
unclaimed setup, use the explicit `--replace-pending` flag. It revokes the old
pending invitation and records the replacement. An expired setup can be retried.
After an account exists, bootstrap cannot add or replace an owner.

The production equivalent runs the same packaged `bootstrap-owner` command with
Villas-specific database settings and `VILLAS_INITIAL_OWNER_EMAIL`. It never uses
an ambient cloud login. Protect configuration files and keep secrets out of command
arguments, source control, screenshots, and chat.

## Google and server sessions

Spring Security owns authorization-code exchange and state, nonce, issuer, audience,
expiry and signature validation. Invitations are checked only after provider validation.
The server replaces provider authentication with a minimal canonical staff identity;
provider access/ID tokens are not retained in the database session. A fresh session ID
is issued on login. JDBC sessions are created by V6, with runtime schema initialization
disabled. The server checks current membership and security generation on every request.
Inventory and guest writes lock and recheck the Owner inside the write transaction.

Production uses `__Host-villas`, Path=/, Secure, HttpOnly and SameSite=Lax, with no
Domain attribute. Explicit HTTP loopback development uses `VILLAS_LOCAL_SESSION`.
The maximum lifetime is seven days and the inactivity limit is three days. Anonymous
OIDC handshakes expire after ten minutes. Unsafe requests require both the current CSRF
header and the configured Origin. There is no Basic/password login or public signup.

The browser obtains session metadata and a CSRF token from `/api/v1/auth/session`.
Tokens remain in memory. Session loss hides protected views and clears loaded records;
entered forms remain only in memory until the same Owner signs in again. Account
changes reset the workspace. Writes require an explicit new submission after sign-in.
Old account responses and action continuations are rejected. Logout is reported as
confirmed only after the server session is read back as anonymous.

Guest creation and search use JSON bodies so contacts do not appear in normal URLs.
Audit events contain surrogate actor/subject IDs and UTC timestamps. The legacy GET
search aliases remain protected for compatibility but the generated client uses POST.

## Recovery and deferred Google setup

If every existing Owner has lost Google access, a database administrator may run the
packaged offline `recover-owner` command (`node scripts/run-api.mjs --recover-owner`
for a private checkout) with `VILLAS_INITIAL_OWNER_EMAIL` set privately. This starts
no HTTP listener and creates only an audited, expiring invitation. It neither signs
anyone in nor bypasses Google verification. It does not deactivate the last Owner.
Protect database administrator access as the recovery authority. Repeating recovery
for an unexpired invitation returns the same invitation. An already active email
must use normal Google sign-in. A restored database and live recovery procedure still
require milestone 10's deployed verification.

The initial Owner email was supplied privately. Google project/client creation and
real-provider verification were explicitly deferred by the owner. Do not publish the
email or mark the real-provider acceptance gate complete from synthetic results.

The intended local Google callback is
`http://localhost:5173/login/oauth2/code/google`. The OAuth client must belong to a
Villas-specific Google project. A web client requires its exact callback registration
and consent configuration. Store its client ID/secret only in private server
configuration. Actual setup and real sign-in/revocation/recovery tests remain open.
Synthetic identity tests prove the local account contract and are not Google evidence.
[Google setup requirements](https://developers.google.com/identity/openid-connect/openid-connect#settingup).

## Verification

`StaffDirectoryIT` uses the pinned PostgreSQL image and real migrations. It checks
explicit bootstrap, exact invitation matching, account mismatch, expiry, replay,
canonical identity across a verified rename, current generation checks, last-owner
races, property isolation, stale edits, and atomic rollback after audit failure.
The packaged bootstrap regression confirms it starts no HTTP listener and leaves
the account table empty until verified acceptance.

`StaffAuthenticationIT` performs real local HTTP OIDC exchanges with signed synthetic
ID tokens and native sessions. It covers rotation and replay, CSRF/Origin denials,
verified invitations, unsupported role input, invalid issuer/audience/expiry/nonce/
signature, seven-day absolute and three-day idle boundaries, logout and revocation.
These tests never call Google. Playwright exercises the same protocol through an
explicit loopback-only synthetic provider. Production refuses that configuration.

Independent review regressions enforce the OIDC handshake's own ten-minute limit at
state creation and callback consumption. Only canonical staff authentication may be
persisted. Any failed post-provider account handoff invalidates the session and permits
a clean new attempt. A public random login generation, separate from the cookie/session
ID, changes on every sign-in so same-Owner reauthentication also rejects old actions.
Logout hides the current workspace immediately and pauses competing session refreshes
until its server response/read-back completes. Pending booking promises are scoped to
the login generation; durable recovery keys remain scoped to the canonical Owner.

## Release runtime

See [deployment.md](deployment.md) for mounted secret files, separate DB accounts,
same-origin TLS, ignored forwarding headers, explicit public shell routes, private
health checks and restricted runtime grants. None of these local checks satisfies
the deferred real Google or deployed acceptance gates.

Production operational logs/metrics use fixed categories without paths, record data,
credentials or exception text. Unexpected HTTP/CLI failures avoid dumping private
values. [Recovery](recovery.md) revokes restored sessions and increments staff security
generations atomically before reopening access. Reconcile restored staff/invitations
and post-backup external payments with the Owner. [Operations](operations.md) keeps
real alert delivery and external availability acceptance separate from local tests.
