# Database migrations

The approved shared target is tracked in [the tenancy contract](contracts/multi-tenancy.md).
V16 adds the business registry and tenant-safe parent/actor relationships without
rewriting V1-V15 or moving existing business records. Unknown legacy business IDs
refuse the upgrade atomically. V18 replaces deployment-wide business authority with
[explicit request scope and PostgreSQL row security](contracts/business-data-isolation.md).
Browser switching is implemented in #47. Shared hosting/recovery qualification remains #48/#49; no additional schema migration is needed for browser switching.

Flyway owns the PostgreSQL schema. Normal API startup validates it and never applies
migrations. Hibernate uses `validate`; automatic SQL/Flyway initialization is disabled.
Use `postgres-image.txt` for native development, CI and backup clients. The approved
hosted database is Neon PostgreSQL 17 in Frankfurt.

V17 backfills identities by provider issuer/subject, preserves all existing membership
and actor IDs, adds identity/onboarding constraints and purges incompatible JDBC
sessions atomically. Staff must sign in again after this upgrade. The
[shared-identity contract](contracts/shared-identity.md) records the new session and
membership rules. V18 preserves V17 rows and current sessions, removes implicit
`property_id` defaults and enables row security on 23 tables. Existing V1-V17
migrations are unchanged.

## Apply locally

Use a fresh checkout for the PostgreSQL transition. From its root:

```sh
node scripts/dev-db.mjs start
./mvnw --batch-mode verify
node scripts/run-api.mjs --migrate
node scripts/run-api.mjs
```

The explicit migration command runs the packaged JAR against that checkout's private
database and starts no HTTP listener. It validates checksums and applies pending
versions. Production starts without guests, rooms, bookings or ledger records.
Fixtures require an explicit local command and refuse existing business data.

## Histories and business binding

Active migrations are V1 through V18 under `src/main/resources/db/postgresql/`.
They cover inventory, staff, JDBC sessions, audit, guest/room profiles, rates, quotes,
stay operations, manual settlement, dated allocations, recovery audit, the business registry, shared identity and row security. The old
MariaDB history under `db/migration/` is preserved byte-for-byte and is never selected
by the PostgreSQL runtime. No adoption or automatic cross-engine import is offered.
See [the transition](postgresql-transition.md).

V1-V17 bind the initial business to the validated `VILLAS_PROPERTY_ID`. Upgrade
preflight verifies that historical marker before applying V18, including when the
legacy business is inactive. V18 retains the marker as history and removes its
deployment-wide authority. Domain requests must select an authorized business; a
deployment setting cannot retarget records or grant access. Production web startup
requires V18, complete row security, private helper-function ACLs and a restricted
non-owner runtime without administrative inheritance or RLS bypass. Offline
migration/onboarding commands retain separate operator credentials.

## Upgrades and failures

Run migrations separately with schema-owner credentials; the web app uses restricted
runtime credentials. PostgreSQL transactional DDL rolls back a failed version, and
Flyway records only successfully committed versions. A native regression introduces
a failing synthetic migration, verifies its table/marker are absent and earlier
Unicode guests/bookings survive, then completes its prerequisite and reruns it.

Stop public writes and drain backup work before schema delivery. Record old images,
schema and a verified off-server backup. Inspect schema/history after failure before
retrying. Future nontransactional DDL needs a specific failure/recovery procedure.
Never edit published SQL, manually advance history, or disable validation. The CLI
exposes no clean, baseline or repair shortcut. There are no down migrations; an old
app image needs verified schema compatibility, otherwise use a forward fix or an
isolated reconciled restore.

Apply reviewed `deploy/runtime-grants.sql` after migration. Runtime can append
financial/audit history and use identity sequences, but cannot run DDL, alter the
binding/Flyway history, change sequences or rewrite immutable entries. The full
backup role has SELECT-only grants and explicit BYPASSRLS so dumps include every
business. Never add bypass or administrator membership to the runtime. The local
reference verifies these roles; provider backup-role qualification remains #48.
No-ACL restores must reapply the grants and PUBLIC function-execution revocations
before any web runtime starts.

## Verification

The native suite uses disposable PostgreSQL databases. It checks empty initialization,
reruns, upgrade preservation, scoped foreign keys, strict dates/cents/statuses,
transactional failure, concurrent bookings and unknown outcomes.
`BusinessRowSecurityMigrationIT` also verifies V17 history/session preservation, an
inactive legacy business, policy-failure rollback/retry and a complete two-business
dump/restore using the read-only backup role. `BusinessDataIsolationIT` exercises
the actual restricted runtime across business workflows and raw SQL. H2 unit tests do not
replace native database evidence. V15 recovery and quarantine revoke restored sessions
and append an audit event atomically. See [deployment](deployment.md) and
[recovery](recovery.md) for operator procedures and remaining live gates.
