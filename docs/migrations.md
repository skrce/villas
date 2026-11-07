# Database migrations

Flyway owns the MariaDB schema. Its version is managed by the Spring Boot dependency
BOM. The application uses the pinned MariaDB image in `mariadb-image.txt` and never
runs migrations as part of normal API startup. Hibernate uses `validate`, SQL init is
disabled, and automatic Flyway startup is disabled.

## Apply locally

```sh
node scripts/dev-db.mjs start
./mvnw --batch-mode verify
node scripts/run-api.mjs --migrate
```

The last command executes `java -jar <packaged-app> migrate` against only this
checkout's private database. It obtains credentials from ignored local state and
starts no HTTP listener. Repeating it validates existing checksums and applies only
pending versions. No guest, room, booking, rate, or payment demo data is inserted.
`node scripts/dev-db.mjs fixtures` remains an explicit local operation.

## Version history

| Version | Change |
| --- | --- |
| V1 | Empty InnoDB/utf8mb4 business tables, property-scoped reference keys, SQL DATE stays, positive capacities, nonnegative legacy prices, and half-open date constraints |
| V2 | Room active state, entity versions, reservation guest count/status, and range checks |
| V3 | Maintenance blocks, transactional operation claims/results, and inventory events with subject/version and property-scoped reference constraints |
| V4 | Calendar, guest-list, and event-history read indexes; no business data changes |
| V5 | Empty staff accounts, expiring invitations, staff events, and a property coordination row; Owner is the only supported role |

V1 to latest and V3 to V4 upgrade tests preserve synthetic Unicode guests, bookings,
operation results, and events. Runtime
inventory writes use the transaction and lock protocol in the
[reservation contract](contracts/reservations.md). New installations contain no
business records, operation results, or events until an explicit workflow writes them.

Each published version is immutable. Add a new version for a later change. Do not
edit a successful migration, manually advance history, or disable validation.
Creation and column-addition statements tolerate already-applied DDL when a reviewed
recovery resumes a partial migration.

## Existing schemas and failures

The owner selected a new empty production database. Flyway baseline/adoption is
disabled. A nonempty database without Flyway history is rejected without dropping
records. A Milestone 1 development volume is not automatically converted. Retain it
and use a fresh checkout's isolated database, or arrange a separate, backed-up adoption.

MariaDB DDL can commit before a later statement fails. A migration is not one
all-or-nothing business transaction. Stop writes before an upgrade, retain a verified
backup and migration history, and inspect any failed migration before retrying.
Flyway rejects failed history entries or checksum mismatches. A history repair must
be reviewed against the actual schema and immutable SQL; repair does not undo DDL.
The application CLI exposes no clean, repair, or baseline shortcut. Do not drop saved
records to make a retry pass.

Production must run the same packaged migrations separately with DDL credentials,
then start the API with restricted runtime credentials. Backup/restore rehearsal,
role provisioning, and production initialization remain milestone 10 gates. This
milestone's evidence uses disposable local MariaDB, not a live deployment.

## Verification

`./mvnw verify` runs migrations against fresh MariaDB containers and checks empty
initialization, reruns, V1 upgrade preservation, foreign keys, property scope,
date/range constraints, and rejection of unversioned schemas. H2 tests do not replace
native migration/locking verification.

A disposable recovery test adds a deliberately failing synthetic migration after
the packaged versions. It proves that early DDL and its marker remain committed,
an unreviewed retry is refused, and completing the missing precondition followed by
explicit repair allows the identical SQL to rerun. Unicode guests and bookings
survive throughout. This test is not a production backup/restore rehearsal and does
not authorize automatic repair of a real database.

## Release delivery

The reference [deployment](deployment.md) runs migrations as a one-off process with
a separate schema-local DDL account. Web startup still validates rather than creates
schema. Runtime grants are explicit in `deploy/runtime-grants.sql`. Review additions
when introducing tables. Record the old schema/images, close writes and verify a
backup before delivery. Partial MariaDB DDL may survive an error; investigate and use
a tested forward fix or isolated restore. There is no automatic down migration.
