# Business request and database isolation

[#46](https://github.com/skrce/villas/issues/46) implements shared business data access
and PostgreSQL row security after [shared identity](shared-identity.md). The
[tenancy contract](multi-tenancy.md) records the remaining browser, hosting and pilot
gates. Shared deployment remains blocked until those gates pass.

## Request selection

Domain requests, including legacy adapters and `/api/v1/staff`, require exactly one
`X-Villas-Business` header. The value is a registered business ID. It selects the
business; it is never a credential. The server verifies the canonical identity,
captured membership generation, active membership and active business.

The `/api/v1/businesses/{businessId}/staff` routes select by path. An optional header
must match that path, and duplicate headers are rejected. Global session,
membership-list and logout routes need no selected business. They expose only the
caller's permitted identity and membership metadata.

Missing context returns `400 BUSINESS_REQUIRED`; malformed or duplicate context
returns `400 INVALID_BUSINESS`. Unregistered, inactive, unauthorized, revoked and
conflicting context returns `403 BUSINESS_ACCESS_DENIED`. This preserves the cookie's
other memberships. The same distinction applies when revocation wins between
request resolution and transaction/staff-lock admission. Invalid global identity/session
generations return 401. A valid
business scope cannot read a foreign resource, quote, report source or saved operation.
Well-formed foreign resource IDs return the same not-found response as absent IDs.

`AuthorizedBusiness` holds the selected ID and the captured membership actor proof.
`BusinessScope` binds it to the current request, then clears it in `finally`.
`CurrentStaff` checks that it still matches the authenticated principal. There is
no process-wide or session-wide active business. Workers inherit no business context;
work must receive the principal and authorized scope explicitly and recheck access
inside its own transaction.

The [console](business-workspace.md) selects its business from the tab URL and
validated membership list. Its fetch adapter supplies the header, rejects missing
context and invalidates captured clients/responses when business or login changes.
A denied grant refreshes global identity without logging out other businesses. #47
adds isolated browser caches, drafts, locks and recovery metadata. Older open tabs
must reload the updated bundle; the API does not default an omitted selector.

## Transactions and queries

Domain services, raw SQL, repository filters, entity creation, locks, reporting,
CSV and operation recovery use the selected business. Entity constructors and
`property_id` inserts have no default tenant. Saved actor IDs remain business
membership IDs. Operation keys are scoped by business, member and operation kind;
report snapshot hashes also include the business.

`DatabaseScope` sets transaction-local claims on the actual JDBC connection used by
Spring's JPA/JDBC transaction. Claims identify the business, canonical identity and
its generation, membership and its generation. Global identity/admission transactions
use separate claims and clear business authority. The scope cannot change within a
transaction. A new transaction establishes its own scope; synchronization suspends
and restores the outer scope for `REQUIRES_NEW`. Commit, rollback and pooled-connection
reuse do not retain authorization. H2 tests check application behavior; native tests
with restricted credentials qualify PostgreSQL policies and connection cleanup.

Writes retain the lock order from the identity contract: canonical person, business
read lock, current membership, then existing domain locks. Staff coordination precedes
those locks where required. After checking the locked rows, the transaction records
its admitted claims and PostgreSQL transaction ID. This lets self-revocation finish
its own atomic audit write. The marker is valid only for that transaction and exact
claims; the following request/transaction revalidates the changed generation.

RLS supplements application authorization. The application is trusted to establish
SQL claims from a validated session/provider result. A holder of unrestricted runtime
SQL execution can set custom PostgreSQL settings, including admission claims. These
policies protect omitted filters, mismatched context and connection reuse; they do
not make a compromised application/database credential an untrusted SQL client.

## Row policies and pre-business lookup

V18 enables row security on 23 tables. Tenant-owned tables use both a visibility
policy and a write check. Runtime writes to actor-bearing history/operation tables
also require the captured member ID. Existing historical actor strings remain intact.
Composite foreign keys retain same-business parent and membership relationships.

The protected tables are `businesses`, `staff_identities`, and the 21 tables with a
`property_id`: apartments, customers, reservations, maintenance, operations/events,
staff coordination/accounts/invitations/events, business events, seasonal rates,
quotes, accepted prices, room readiness/events, ledger entries, room allocations,
recovery events, the historical property marker and onboarding receipts.

Identity lookup needs limited access before a business can be selected. Separate
policies permit only the caller's canonical identity and own membership metadata.
Verified admission can inspect the provider's memberships and matching-email
invitations/conflicts, coordinate candidate businesses, and write its own acceptance
records. It cannot read guest, booking or financial rows. Existing inactive membership
coordination remains lockable so sign-in can recheck and skip it; reactivation still
needs a new valid invitation. Business metadata and admission eligibility stay strict.

Four fixed `SECURITY DEFINER` Boolean helpers inspect membership/profile state without
recursive policies. They use a fixed `pg_catalog, pg_temp` search path and fully
qualified tables. They accept no caller SQL, return no records, and have no PUBLIC
execution grant. The runtime may execute them but cannot replace them or alter policies.
Sessions, their attributes, the global identity coordination singleton and Flyway
history are technical/global records, not business-query tables.

The pre-V18 property marker remains necessary for safe historical upgrades. After
V18 it is not a deployment-wide tenant authority. Production startup verifies the
shared schema and rejects web credentials that own tables, inherit administrative or
RLS-bypass authority, lack the complete policy set, or expose the helper functions to
PUBLIC. Local fixture preparation uses a private operator database; it does not
qualify runtime isolation.

## Operator and backup authority

| Authority | Database access |
| --- | --- |
| Web runtime | No table ownership, schema creation, administrative inheritance or RLS bypass; scoped data and narrowly defined identity lookup |
| Migration/operator | Owns the schema; explicitly applies migrations, onboarding and recovery under controlled maintenance |
| Full backup | SELECT-only data/sequence grants plus explicit BYPASSRLS; no writes, schema creation or administrative membership |

A normal NOBYPASSRLS login cannot make a complete `pg_dump` under these policies.
The dump must fail instead of silently filtering businesses. Do not pass
`--enable-row-security` to work around that refusal. The local reference provisions
an explicit read-only BYPASSRLS backup role and verifies both businesses survive
export/restore. PostgreSQL's [row-security behavior](https://www.postgresql.org/docs/17/ddl-rowsecurity.html)
and [row_security setting](https://www.postgresql.org/docs/17/runtime-config-client.html#GUC-ROW-SECURITY)
explain why backup authority differs from runtime authority.

The earlier Neon role seed remains unqualified for shared backups and live commands
remain blocked. #48 must qualify a narrowly privileged backup role with the provider;
never use or inherit a Neon administrator as the web runtime. See
[Neon's role rules](https://neon.com/docs/manage/roles). Actual resources, off-server
recovery, alert delivery and cost/availability acceptance remain open.

Dumps intentionally omit owner/grant statements. Restoring functions without ACLs
recreates default PUBLIC EXECUTE. Apply `deploy/runtime-grants.sql`, including its
PUBLIC revocations, before any web runtime starts. Keep the target quarantined until
schema, roles, row policies, all-business contents and session invalidation are checked.
Whole-business selective recovery and auditing every business affected by a full
restore remain #48; this step does not qualify those workflows.

## Verification

`BusinessDataIsolationIT` uses real restricted runtime credentials for complete
priced/paid stays in two businesses, all-endpoint unauthorized selectors, foreign
resource/recovery IDs, unfiltered SQL, forged claims, transaction nesting/pool reuse,
worker context, independent revocation and fresh login after deactivation.
`BusinessRowSecurityMigrationIT` checks complete V17 row/session preservation,
transactional policy failure/retry, private helpers and full-backup authority.
Existing native booking/money/staff tests, signed-provider HTTP tests, browser tests,
client regeneration and image/restore checks remain required. Final revision, CI,
independent review and merge evidence belong in #46 and its PR.
