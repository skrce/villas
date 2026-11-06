# Staff security

The initial release supports Owners only, as confirmed by the owner. All new staff
invitations grant full Owner access. Sessions will have a seven-day absolute limit
and a three-day inactivity limit. Staff identity is separate from guest records.

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

## Google and session integration status

The account foundation is implemented. The following integration remains the next
PR: Spring Security authorization-code OIDC, provider/state/nonce validation, server
sessions, CSRF, cookie settings, session rotation, logout, expiry and current account
checks on business requests. The frontend credential form will be removed after
that integration. Default production mode continues to deny business access.

The intended local Google callback is
`http://localhost:5173/login/oauth2/code/google`. The OAuth client must belong to a
Villas-specific Google project. A web client requires its exact callback registration
and consent configuration. Store its client ID/secret only in private server
configuration. Actual setup and real sign-in/revocation/recovery tests remain open.
Synthetic identity tests prove the local account contract and are not Google evidence.
[Google setup requirements](https://developers.google.com/identity/openid-connect/openid-connect#settingup).

## Verification

`StaffDirectoryIT` uses the pinned MariaDB image and real migrations. It checks
explicit bootstrap, exact invitation matching, account mismatch, expiry, replay,
canonical identity across a verified rename, current generation checks, last-owner
races, property isolation, stale edits, and atomic rollback after audit failure.
The packaged bootstrap regression confirms it starts no HTTP listener and leaves
the account table empty until verified acceptance.
