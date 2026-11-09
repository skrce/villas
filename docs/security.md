# Staff security

The initial release supports Owners only, as confirmed by the owner. All new staff
invitations grant full Owner access. Sessions have a seven-day absolute limit
and a three-day inactivity limit. Staff identity is separate from guest records.

V17 separates canonical Google identity from independent Owner memberships under
[#45](https://github.com/skrce/villas/issues/45). V18 requires explicitly authorized
business requests and PostgreSQL [data isolation](contracts/business-data-isolation.md).
The [console](contracts/business-workspace.md) uses explicit per-tab business URLs,
validated membership capabilities and isolated state. Shared hosting remains #48. Read [shared identity](contracts/shared-identity.md) and
[the tenancy contract](contracts/multi-tenancy.md) before extending authentication.

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

Canonical provider identity and per-business membership are distinct. New IDs are
random UUIDs; migrated membership IDs remain unchanged because immutable history
references them. Provider issuer and subject identify the Google account. Email is
an invitation/contact field and never merges identities. A verified rename retains
both kinds of ID and invalidates older global logins; membership revocation affects
only that business's captured grants. [Google OIDC documentation](https://developers.google.com/identity/openid-connect/openid-connect).

## Initial owner setup

First migrate the checkout's private database and build the packaged application.
Put `VILLAS_INITIAL_OWNER_EMAIL` and the explicit `VILLAS_OWNER_BUSINESS_ID` in the ignored `.env.local` configuration, then run:

```sh
node scripts/run-api.mjs --bootstrap-owner
```

This starts no HTTP listener. It creates a pending invitation only if the selected
business has no staff accounts. A repeat with the same email returns the existing unexpired
invitation. A different email is refused while one is pending. To correct an
unclaimed setup, use the explicit `--replace-pending` flag. It revokes the old
pending invitation and records the replacement. An expired setup can be retried.
After an account exists in that business, bootstrap cannot add or replace its Owner.

The production equivalent runs the same packaged `bootstrap-owner` command with
privileged Villas-specific database settings, `VILLAS_INITIAL_OWNER_EMAIL` and `VILLAS_OWNER_BUSINESS_ID`. The web runtime cannot bootstrap an Owner. It never uses
an ambient cloud login. Protect configuration files and keep secrets out of command
arguments, source control, screenshots, and chat.

## Google and server sessions

Spring Security owns authorization-code exchange and state, nonce, issuer, audience,
expiry and signature validation. Invitations are checked only after provider validation.
The server replaces provider authentication with a canonical identity ID/generation
and independent membership ID/generation grants. It stores no active-business selector;
provider access/ID tokens and provider profiles are not retained in the database session. A fresh session ID
is issued on login. JDBC sessions are created by V6, with runtime schema initialization
disabled. The server checks the canonical identity on protected requests and resolves
business requests against live membership and captured generation. Writes lock and
recheck the person, active business and Owner inside the transaction. V17 purges the
old session representation during migration, so existing staff sign in again.

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

## Business onboarding and recovery

For the first compatibility business, use `bootstrap-owner` above. For another
business, migrate V17 and use the private offline `onboard-business` command. In a
private checkout, put these inputs in its ignored configuration, then run:

```sh
node scripts/run-api.mjs --onboard-business
```

`VILLAS_NEW_BUSINESS_ID` is a stable lowercase/digit/hyphen ID of 1-64 characters.
`VILLAS_NEW_BUSINESS_NAME` is the display name, at most 100 characters with no control
characters. `VILLAS_INITIAL_OWNER_EMAIL` is the first Owner's private invitation email.
All three support `_FILE` inputs to the packaged command. Runtime database credentials
cannot onboard; use the separate migration/operator authority. The local wrapper
always uses its checkout's private database; hosted operator jobs remain #48.

The command creates the business, coordination row, pending invitation, operator
audit event and hashed setup receipt atomically. It starts no HTTP listener, sends
no message and creates no account/password. Repeat identical inputs after an uncertain
result. A recorded operation reports its observed invitation state without reissuing
it; changed setup details are refused. Inspect the existing business before choosing
a new ID. An expired/revoked invitation uses explicit recovery rather than another
onboarding operation.

Set `VILLAS_OWNER_BUSINESS_ID` privately for `bootstrap-owner` or `recover-owner` to
target an existing business. It is required; no deployment/default business is selected.
It is separate from the historical migration seed and the console compatibility summary.
Domain requests always select their business explicitly. First-Owner recovery requires the
same privileged database authority and Google verification as initial setup.

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
Use one Google client and canonical callback per environment for all businesses.
Synthetic identity tests prove the local account contract and are not Google evidence.
[Google setup requirements](https://developers.google.com/identity/openid-connect/openid-connect#settingup).

## Verification

`SharedIdentityMigrationIT` proves provider-key grouping without email merging,
complete membership/financial/audit preservation and atomic schema/session rollback.
`SharedIdentitiesIT` covers independent grants, reactivation, last Owners, canonical
renames, forged scope, concurrent admission/revocation, active-business waits,
all-business login audit rollback and packaged operator retry/privacy behavior.


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
the login/business epoch; durable recovery keys bind canonical identity, business
and membership. #47 isolates caches, memory drafts and recovery aliases and rejects
late completions after switching, including a return to the original business.

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

Business requests and PostgreSQL runtime/backup authority follow the [business data isolation contract](contracts/business-data-isolation.md).
