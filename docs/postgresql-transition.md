# PostgreSQL transition

The Owner approved PostgreSQL and preparation for Cloud Run + Neon in Frankfurt on
November 8, 2026. Each business has a separate app deployment, Neon project/database,
credentials, Google client and backup configuration. The same personal accounts as
ABL may own those resources; their operational data and credentials remain separate.
Daily encrypted backups retain seven days, with 24-hour loss/recovery targets.

## Existing data and schema history

Production has not launched and starts with an empty PostgreSQL database. This is
an engine port, not an in-place conversion of a MariaDB volume. Existing local/demo
MariaDB records and `.local-state` remain intact. Do not import them as production
data, rename their Docker volumes, or feed a MariaDB SQL dump to PostgreSQL.

The published MariaDB migrations in `src/main/resources/db/migration/` and their
image pin remain historical files. Active Flyway delivery selects the independent
PostgreSQL versions under `src/main/resources/db/postgresql/` and uses
`postgres-image.txt`. The local launcher uses a distinct Compose project identity
and refuses an old engine's retained state. Use a fresh checkout for PostgreSQL.

PostgreSQL stores property dates as DATE and UTC events as timestamptz with six-digit
precision. Identity columns generate record IDs; saved financial/event IDs still
cross JSON as decimal strings. Explicit fixture IDs do not advance identity sequences
automatically, so the opt-in room fixture advances its sequence explicitly.

Schema migrations are transactional. Native regressions prove failed DDL rolls back
while earlier business data survives, and the same migration can succeed after its
precondition is corrected. Keep future nontransactional DDL explicit and separately
qualified. Published migrations remain immutable; clean/baseline shortcuts stay disabled.

## Business configuration

Set a stable `VILLAS_PROPERTY_ID`, using 1 to 64 lowercase letters, digits or hyphens,
and a `VILLAS_PROPERTY_NAME` of at most 100 characters. The default local business is
`villa-rosa` / `Villa Rosa`. Flyway initializes matching defaults and the staff lock.
`property_identity` binds the database to that ID; application startup rejects a
mismatch. Each API/session remains scoped to the deployment. This adds no browser
business switcher or shared multi-business tenancy.

The browser gate runs the entire workflow with a non-default business ID and name.
Native checks cover booking races, exact prices/ledger balances, Unicode contacts,
UTC/DST behavior, sessions, schema upgrades and rollback. The frontend contract/client
is regenerated from backend OpenAPI; display names are rendered as text.

## Release verification

Run the complete check from the repository root, then build and rehearse a clean,
committed release:

```sh
node scripts/check.mjs
node scripts/build-release.mjs
node scripts/release-check.mjs
```

The container rehearsal uses native PostgreSQL, restricted runtime/backup accounts,
encrypted streaming backup, an isolated empty restore target and business/audit
reconciliation. Restored sessions are purged and staff security generations change.
Native and loopback evidence remain separate from actual Neon TLS, Cloud Run Google
login, off-server recovery, alerts and the Owner pilot. See [issue #11](https://github.com/skrce/villas/issues/11).
