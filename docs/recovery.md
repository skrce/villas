# Backups and recovery

The Owner superseded the per-business layout with a shared app and database per
environment. Follow [the tenancy contract](contracts/multi-tenancy.md) and #44-#49.
Shared identity, explicit business data access and PostgreSQL row security are
implemented. Browser switching remains #47; the operational reference still has a
configured compatibility recovery target. Live Terraform commands are blocked before authentication until #48
replaces the topology. Do not use the earlier setup instructions below to provision
resources or treat them as shared-tenancy qualification.


The selected shared recovery design is in [Cloud Run + Neon](cloud-run-neon.md#backups-recovery-and-signals)
and #48. The local reference verifies all-tenant dumps with a dedicated read-only BYPASSRLS
role. Provider backup authority and selective business recovery remain #48.
The current script purges global sessions and audits its configured business; it
must not be treated as a tenant-aware restore. The Docker Compose procedure below
remains the single-business local reference. A local restore is separate from a
timed off-server qualification.

The Owner confirmed daily encrypted backups retained seven days, at most 24 hours
of lost data and a 24-hour recovery-time target. Cloud Run + Neon in Frankfurt is
approved. Actual off-server storage, credentials, alert delivery and timed hosted
recovery remain release gates. A Docker volume or retained demo is not a backup.
See [deployment](deployment.md), [operations](operations.md) and the
[release checklist](release-checklist.md).

## Backup contract

The backup image uses the pinned PostgreSQL 17 client and restic. `pg_dump` streams
one compressed custom-format logical snapshot into encrypted storage without writing a plaintext
SQL export to disk. It captures the app's public schema, data, sequence positions
and Flyway history. Owner/grant statements are excluded; restore uses separately
reviewed roles/grants. Stop the scheduler and drain active backup work before DDL.
See [PostgreSQL's pg_dump contract](https://www.postgresql.org/docs/17/app-pgdump.html).

The reference schema supports base tables, identity sequences and the four bundled
row-security Boolean helpers. Other database programs, views and external objects
require a reviewed extension of the backup contract. The
release rehearsal rejects unsupported objects. A failed producer or archiver cannot
produce a completed snapshot. Both children cancel each other on failure, escalate
stuck processes and have bounded execution. Default command/job budgets are 900/1800
seconds; the configurable whole-job maximum is 3600 seconds.

Only snapshots tagged `villas-complete` qualify for restore. Pending snapshots are
cleaned by exact pending tag, host and path after their deadline/grace. Completed
snapshots and other identities are excluded. Failed metadata lookups remain failures,
never claims that remote data is absent. Retention is scoped to the selected identity.
See [restic retention](https://restic.readthedocs.io/en/stable/060_forget.html).

## Reference configuration

`deploy/backup.compose.yaml` supplies the configured single-business local reference.
Use a distinct repository and backup identity for each isolated reference environment.
The shared hosting target is one all-business repository per environment; #48 must
implement and qualify it. Seven daily snapshots and zero hourly snapshots are the
approved defaults. Repository/encryption recovery
material must survive loss of the application host. Web/migration identities do not
receive repository credentials.

Private files are `backup_repository`, `backup_password` and, for an S3-compatible
repository, `backup_credentials.json`. The latter accepts only explicit AWS key,
secret, optional session token and region fields. Ambient operator credentials are
not forwarded. A local repository requires the guarded disposable rehearsal mode.
Cloud Run storage/identity configuration is separate from this reference and must
be qualified with the selected personal resources before scheduling.

PostgreSQL connections use certificate/hostname verification by default. The private
Compose network explicitly disables TLS for its own disposable database; Cloud Run
requires verified TLS to Neon. Secrets travel through mounted files/child environment,
never command arguments or logs. Each process receives only its needed credentials.

Run operations with explicit Docker context, Compose project, env file and compose
files. Initialize a new repository once, run a manual backup and integrity check,
record the completed snapshot/source revision/schema/digests privately, then enable
scheduling only after delivery/recovery checks. Never delete/reinitialize a repository
to resolve an uncertain error.

The reference scheduler waits 23 hours after each attempt, reserving two 30-minute
job budgets inside the 24-hour data-age window. Invalid interval/job/age combinations
fail before scheduling. A successful status stores `protectedAt` before the snapshot
starts and `completedAt` after upload. Freshness uses `protectedAt`; a slow upload
does not make old data fresh. A failed run retains prior success timestamps.
Actual failures/outages can still breach the target and require verified alerts.

## Isolated restore

1. Close public traffic and stop application/migration/backup writers. Preserve failed
   volumes and private evidence. Select a verified completed snapshot and reconcile
   later external payments and booking changes. Never overwrite the failed database.
2. Use standalone `deploy/restore.compose.yaml` with a new explicit project, fresh
   volume and new DB credentials. It has no public ports or application. Keep source
   repository/encryption material separate from the new database secrets.
3. Select the full completed snapshot ID, compatible source app/backup/PostgreSQL
   digests and original backup identity. The target must have zero schema tables
   before import. A populated target is refused. Preserve a failed target for diagnosis.
4. Read the bounded archive catalogue and retain the preprovisioned public schema
   and its grants. Stream `pg_restore` with error-stop and a PostgreSQL transaction. A failed import stays closed.
   On success, an atomic quarantine deletes restored sessions, increments staff
   security generations and appends a recovery audit event with snapshot, counts and
   UTC time. Do not serve traffic if import or quarantine fails.
5. Validate the shared schema and the selected environment's recovery configuration using compatible images.
   Rehearse forward migrations before choosing a newer image; there are no automatic
   down migrations or schema rollback shortcuts.
6. Reconcile room/guest/booking contents, dated assignments, accepted nightly prices,
   payments/refunds/reversals, saved operation results, balances and audit continuity.
   Counts alone do not prove integrity. The local rehearsal compares complete
   business/configuration/history contents and expected quarantine changes.
7. Review restored staff/invitations, including revocations after the snapshot, with
   the Owner. Reconcile post-snapshot money/bookings before allowing new writes.
   Never automatically replay old operations after data loss.
8. Apply reviewed runtime grants, including the PUBLIC execution revocations on all four row-security helpers. A no-ACL restore otherwise recreates default PUBLIC function access. Apply these grants before starting any web runtime. Verify old cookies fail and a current invited
   Owner can sign in again. Synthetic-provider proof remains separate from real Google.
9. Record measured snapshot age, total recovery/reconciliation time, known loss and
   Owner acceptance. Take and verify a new backup, resume protection/monitoring and
   confirm actual alert delivery before reopening writes.

The 24-hour recovery target includes operator response and validation, not just SQL
import. Local synthetic timing does not establish hosted/off-server performance.
Keep dumps, credentials, cookies and real guest/financial evidence out of GitHub,
logs, screenshots and this handoff.

The [business data isolation contract](contracts/business-data-isolation.md#operator-and-backup-authority) defines runtime, operator and backup permissions. Never enable row-filtered pg_dump to make an unqualified backup role appear successful.
