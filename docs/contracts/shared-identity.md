# Shared Google identity and business memberships

[#45](https://github.com/skrce/villas/issues/45) implements one Google identity and
server session across independent Owner memberships. The shared booking/data context,
PostgreSQL row security, business switcher and shared hosting remain #46-#49. The
[tenancy contract](multi-tenancy.md) owns that rollout. Live deployment stays blocked.
Real Google setup and provider acceptance remain deferred in #4.

## Identity and history

| Record | Meaning |
| --- | --- |
| `staff_identities` | One canonical identity per validated provider issuer/subject, with current verified email and a global security generation |
| `staff_accounts` | One Owner membership per business/provider identity, retaining the original staff ID and its own active state and security generation |
| Server principal | Canonical identity ID/generation and a map of business IDs to membership ID/generation grants |
| Financial, operational and staff actors | The existing business membership ID, never a replacement canonical identity ID |

V17 groups old accounts only by issuer and subject. Email is not an identity merge
key. It retains every membership, quote, ledger and audit ID and existing account
fields. A canonical migrated ID is the smallest existing membership ID in its group;
new identities and memberships receive independent UUIDs. The canonical email is
initialized deterministically and updated only from a subsequently validated login.
A natural composite foreign key binds membership issuer/subject to an identity.

V17 clears all JDBC session attributes and sessions atomically with its schema
changes. Old serialized membership principals cannot survive the change. Migration
failure rolls back both schema and session deletion; the unchanged migration can be
retried after correcting its failed prerequisite. Existing V1-V16 files are unchanged.

## Admission and revocation

Spring Security validates Google state, nonce, signature, issuer, audience and expiry
before admission. Only verified email participates in invitation matching, using
case normalization and surrounding-whitespace trimming. Dots and plus aliases stay
significant. Google issuer/subject remains the account key after an email change.
Provider tokens and complete provider profiles are not retained in the server session.

A fresh verified sign-in admits active memberships and consumes matching unexpired
invitations in active businesses. A deactivated membership needs a new invitation;
its accepted historical invitation cannot reactivate it. An email already bound to
a different provider account within that business cannot be taken over. A verified
rename retains identity/membership IDs and increments the global generation, invalidating
older logins. Conflicting active email bindings refuse the rename atomically.

The session captures independent membership generations at sign-in. Refreshing a
session can remove revoked grants but cannot silently upgrade generations or accept
new invitations. A new Google sign-in is required for new or renewed grants.
Revoking or deactivating one membership denies that business without invalidating
the session's unrelated memberships. Last-Owner protection applies independently
inside each business. Session limits remain seven days absolute and three inactive
days. Logout invalidates the current server session across its businesses.

## Explicit staff requests

| Request | Scope |
| --- | --- |
| `GET /api/v1/auth/session` | Anonymous state, or the caller's identity/current memberships, CSRF token, expiry and generation |
| `GET /api/v1/auth/memberships` | Only the authenticated caller's still-authorized membership metadata |
| `/api/v1/businesses/{businessId}/staff` and its invitation/deactivation/revocation operations | Explicit requested business, resolved against the current principal and live Owner membership |
| `POST /api/v1/auth/logout` | The authenticated identity, including when the configured workspace grant is absent |

A path identifier selects a business and never proves access. Missing routes do not
fall back to a business. Malformed selectors are rejected; unauthorized, unregistered,
inactive and forged business grants return the same access-denied category. Unsafe
requests require CSRF and the configured Origin. The server does not keep a mutable
active business in the session, so requests in different tabs do not retarget each other.
Anonymous session responses disclose no business names. Membership lists exclude
unrelated and revoked businesses even when their IDs are known.

The legacy `/api/v1/staff` adapters and booking/guest/room/financial routes still name
the configured compatibility workspace through their fixed server binding. They
require that business's live membership and reject a conflicting `X-Villas-Business`
header; that header is not a tenant selector. They never select another authorized
business when the configured grant is absent. #46 replaces that domain boundary;
#47 scopes browser state and adds switching. Do not expose a shared service based
on these compatibility adapters.

The current console continues to use the configured business. An identity without
that grant sees a workspace-access message and can sign out, while its authorized
staff APIs remain usable. Protected console data is hidden. The routed multi-business
console and independent drafts/caches remain #47.

## Transactions and permissions

Sign-in serializes identity admission, takes business coordination locks in sorted
order, locks the canonical person, then holds business read locks while reading and
writing memberships, invitations and their audit events in one transaction. Candidate
business IDs may be discovered earlier; membership/invitation entities must be loaded
after the coordination locks so cached entities cannot outlive a revocation.

Staff administration takes the business coordination lock, canonical person lock,
business read lock and membership locks. Business writes take the person, business
read and membership locks before existing domain locks. Refreshing the locked business
entity rechecks active state after a wait. Revocation/rename/deactivation committed
before these locks prevents the write; an already-admitted write finishes first.

Only offline bootstrap/recovery omits a staff actor. It still locks the business and
records its system invitation event. The runtime can update identity coordination and
validated identity/membership data but cannot create businesses, coordination rows or
onboarding receipts. Onboarding needs separate database authority and has no HTTP route.
RLS and complete domain tenant isolation remain #46; current privileges are not their
qualification.

## Operator onboarding

The private `onboard-business` command creates a business, its coordination row, one
pending first-Owner invitation, an operator audit event and a request-hash receipt in
one transaction. It creates no Google account, password or authenticated membership.
Creating an invitation sends no message. Staff activate it through verified Google login.

The stable business ID and normalized setup inputs identify the operation. A repeated
identical command reads the recorded invitation state, including accepted/expired/
revoked state, without reissuing it. Different setup inputs for that ID are refused.
An existing business without an onboarding receipt uses the explicit bootstrap or
recovery procedure instead. A failed command may have committed; inspect/retry the
same private setup inputs rather than choosing a new ID. See
[private setup and recovery](../security.md#business-onboarding-and-recovery).

## Verification

Native tests cover provider-key migration without email merging, retained history,
transactional schema/session rollback, two-business grants and metadata, forged IDs,
independent revocation/reactivation, last-Owner protection, concurrent admission,
revocation and active-business waits, verified-rename races and audit rollback.
Synthetic-provider HTTP tests cover both scoped businesses, CSRF/Origin, a surviving
second grant, identity-only logout and denial of legacy data access without its grant.
The packaged onboarding test starts no HTTP listener and reveals no private inputs.
Browser/session and generated-client checks remain part of the complete gate; exact
revision/review evidence belongs in #45 and its PR.
