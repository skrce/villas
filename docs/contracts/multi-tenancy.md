# Shared tenancy

The Owner approved one shared Villas application and one shared PostgreSQL database
per environment on November 8, 2026. Staging and production remain separate. Each
accommodation business is a tenant and initially manages one property. ABL remains
a separate application with separate resources. Personal account ownership,
Frankfurt, EUR, Europe/Skopje and the existing business policies remain approved.

The target is fewer than 100 staff users and roughly 2,000 total requests per day.
This is a sizing input, not a measured concurrency or free-tier guarantee.

## Delivery status

Milestone [#11](https://github.com/skrce/villas/issues/11) owns this conversion and
the final release. The earlier database-per-business infrastructure is superseded.
No shared deployment is qualified while the following steps remain open.

| Order | Issue | Deliverable | Current state |
| --- | --- | --- | --- |
| 1 | [#44](https://github.com/skrce/villas/issues/44) | Business registry, parent/actor relationships and deployment block | Implemented; review and qualification evidence in #44 |
| 2 | [#45](https://github.com/skrce/villas/issues/45) | Shared Google identity, business memberships and controlled onboarding | Implemented; final review/qualification evidence in #45 |
| 3 | [#46](https://github.com/skrce/villas/issues/46) | Authorized request context, scoped services and PostgreSQL row security | Implemented; final review/qualification evidence in #46 |
| 4 | [#47](https://github.com/skrce/villas/issues/47) | Business switching, separate browser caches/drafts and safe recovery | Implemented; final review/qualification evidence in #47 |
| 5 | [#48](https://github.com/skrce/villas/issues/48) | Shared hosting, all-business backup and selective business recovery | Planned |
| 6 | [#49](https://github.com/skrce/villas/issues/49) | Complete isolation, burst checks, independent review and live pilot | Planned |

Each step adds its own regression tests and receives independent review. The final
qualification also covers complete two-business staff workflows, not only isolated
access checks. Real Google remains separately open in
[#4](https://github.com/skrce/villas/issues/4).

## Business and identity boundaries

`property_id` remains the database tenant key during the conversion. It identifies
a registered business. Do not rename every domain column merely to change that
vocabulary. Existing record and membership IDs referenced by immutable price,
financial, operational and staff history must survive the conversion.

The business registry stores the stable ID, display name, active state, currency,
property timezone, version and UTC creation instant. The initial market supports
only EUR and Europe/Skopje. New currencies, timezones, staff roles and multiple
properties within a business require separate implementation decisions.

One canonical Google issuer/subject identity may have independent Owner memberships
in several businesses. Owners manage staff and records only within their business.
Creating businesses and their first pending Owner invitation is an explicit
operator action. Public signup, staff passwords and public platform-administrator
access remain disabled. A business Owner does not receive access to other businesses.

First sign-in and invitations retain the existing verified-email rules. Deactivating
or revoking one membership must prevent that business's reads and writes without
deactivating unrelated memberships. Preserve per-business last-Owner protection.
Seven-day absolute and three-day inactivity limits still apply to server sessions.

Only the authenticated person's authorized businesses may appear in a membership
list. Business names, staff accounts and invitations are protected metadata.
The application uses one Google client and canonical callback per environment.

## Request, transaction and database context

Every business request carries an explicit business identifier, independently of
other tabs. The server resolves it against the current authenticated identity and
active membership. A path/header identifier is a selection, not proof of access.
Missing, malformed, unregistered, inactive or unauthorized context fails closed.
Do not select the first available business or fall back to a deployment default.

Use immutable authorized context for the whole request and each business operation.
Never change a process-global business value or a session-wide active business to
retarget other requests. Background work must receive explicit authorized scope.
Preserve membership rechecks and locks inside writes.

Keep explicit tenant filters in repositories, raw SQL, locks, reporting and exports.
Transactions set local database tenant context on the connection they actually use.
Pooled connections, new/nested transactions and failed requests must not retain or
inherit another request's scope. Missing context denies business data.

Add row security to tenant-owned tables, including write checks. The runtime role
must not own those tables or bypass their policies. Global identity lookup and
membership resolution need narrowly defined access before business context exists.
Migration and backup permissions remain separate from runtime access. These are
application design rules built on [PostgreSQL row-security behavior](https://www.postgresql.org/docs/17/ddl-rowsecurity.html),
not a claim that RLS is implemented by the first migration.

Related business rows, memberships and current actor references use composite
foreign keys. Earlier inventory actor strings predate the staff model; preserve
them as history instead of inventing accounts. Current business writes must still
verify the actual membership. Account IDs and opaque resource IDs never establish
tenant authorization by themselves.

## Browser state and operation recovery

Business URLs support two businesses open in different tabs. Display the current
business consistently; show a selector only when the user has several memberships.
Scope API clients, query caches, in-memory drafts, request generations, Web Locks
and persisted opaque recovery metadata by business and actor.

Switching must cancel or ignore prior-business reads, downloads and completion
callbacks. Preserve each business's own entered drafts and original quote/version/
operation intent. A delayed response or idempotency key cannot populate or mutate
another business. Do not automatically submit after switching, reconnecting or
signing in. Raw guest details, reasons and money stay out of persistent browser
storage under the existing recovery contracts.

## Deployment and recovery

Use one Cloud Run service and Neon database per environment in the approved
Frankfurt regions. Consolidate secrets, Google configuration and operational jobs
by environment with separate runtime, migration, backup and scheduler authority.
Keep ABL, staging and production credentials/state separate. Preserve keyless
exact-source image publication, digest promotion and controlled maintenance.

Retain seven daily encrypted snapshots with the approved 24-hour data-loss and
recovery targets. Shared backup must contain every business. PostgreSQL normally
disables row filtering during pg_dump and refuses access that would be filtered;
the new backup role/policies must be explicitly qualified under RLS rather than
silently accepting a partial export. See [PostgreSQL row_security](https://www.postgresql.org/docs/17/runtime-config-client.html#GUC-ROW-SECURITY).

A whole-database restore affects all businesses, purges old sessions and records
quarantine for every affected business. Selective recovery first restores a full
snapshot into an isolated environment, then reconciles the selected business under
controlled maintenance without rolling back other businesses or erasing immutable
evidence. Both paths need native/image rehearsals and a timed off-server rehearsal.
The earlier single-business recovery script is not this shared recovery contract.

## Current implementation boundary

V16 adds `businesses`, backfills the configured legacy business and links all
tenant-owned tables to it. It tightens quote, accepted-price, readiness and ledger
actor references to the same business. The existing V1-V15 files remain unchanged.
Unknown legacy business data refuses the upgrade atomically; do not adopt it by
inventing another business. Preserve it for operator inspection.

V17 provides shared Google sessions and explicitly scoped Owner membership management.
V18 and [business data isolation](business-data-isolation.md) require explicit business
selection for domain requests and add PostgreSQL row security. The configured
compatibility summary remains for older API clients and verified legacy receipt
aliases; it grants no data access. [Business workspaces](business-workspace.md) implement
#47 with explicit per-tab URLs and isolated state. Shared hosting/recovery remains #48. Pre-V18 database binding is retained only for safe
legacy upgrades, and the shared schema no longer requires a deployment-wide business.

`deploy/cloud/architecture.json` marks shared hosting as pending. The operator wrapper
blocks the earlier layout before cloud authentication and invalidates old plans.
Local mock-provider checks remain available. Do not remove the block or provision
the old topology to work around an incomplete shared implementation.
