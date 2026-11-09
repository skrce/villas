# Database migrations

Flyway owns the PostgreSQL schema. Normal API startup validates it and never applies
migrations. Hibernate uses `validate`; automatic SQL/Flyway initialization is disabled.
Use `postgres-image.txt` for native development, CI and backup clients. The approved
hosted database is Neon PostgreSQL 17 in Frankfurt.

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

Active migrations are V1 through V15 under `src/main/resources/db/postgresql/`.
They cover inventory, staff, JDBC sessions, audit, guest/room profiles, rates, quotes,
stay operations, manual settlement, dated allocations and recovery audit. The old
MariaDB history under `db/migration/` is preserved byte-for-byte and is never selected
by the PostgreSQL runtime. No adoption or automatic cross-engine import is offered.
See [the transition](postgresql-transition.md).

Each new database binds to the validated deployment `VILLAS_PROPERTY_ID`. Flyway
uses that value for property defaults, the staff lock and `property_identity`.
Changing the configured ID does not retarget existing records. Startup refuses a
database bound to another business. Runtime cannot rewrite that binding/history.

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
binding/Flyway history, change sequences or rewrite immutable entries. Backup has
read-only access. These roles are independently verified in the release rehearsal.

## Verification

The native suite uses disposable PostgreSQL databases. It checks empty initialization,
reruns, upgrade preservation, scoped foreign keys, strict dates/cents/statuses,
transactional failure, concurrent bookings and unknown outcomes. H2 unit tests do not
replace native database evidence. V15 recovery and quarantine revoke restored sessions
and append an audit event atomically. See [deployment](deployment.md) and
[recovery](recovery.md) for operator procedures and remaining live gates.
