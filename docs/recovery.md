# Backups and recovery

The Owner confirmed daily encrypted backups, at most 24 hours of lost data and a
24-hour recovery-time target in D15. Hosting/domain selection is explicitly deferred;
continue local preparation. Off-server credentials, retention duration and operational
ownership remain open under D04. No personal hosting or off-server recovery acceptance
has occurred. See [deployment](deployment.md), [operations](operations.md) and the
[release checklist](release-checklist.md). A Docker volume or retained demo is not a
backup.

## Backup contract

The backup image uses the same pinned MariaDB client as the server and pinned restic.
It streams an InnoDB logical dump directly into an encrypted restic repository. It
never writes a plaintext SQL export to the host or container filesystem. Normal
business transactions may continue. Stop backup jobs before schema delivery: MariaDB
warns against concurrent DDL during a
[`--single-transaction` dump](https://mariadb.com/docs/server/clients-and-utilities/backup-restore-and-import-clients/mariadb-dump).
The supported schema contains only InnoDB base tables. Triggers, views, routines and
DB events are outside this backup contract; the release rehearsal rejects them.
Extend and qualify the backup strategy before introducing them through migrations.
Do not add database programs outside versioned delivery.

Both producer and archiver must finish successfully before a snapshot gets the
`villas-complete` tag. Failed streams never qualify for restore. Paired processes
cancel each other on failure, escalate a stuck child, and have bounded execution.
Default command and whole-backup limits are 900 and 1800 seconds respectively.
`VILLAS_BACKUP_COMMAND_TIMEOUT_SECONDS` can change the command limit; the whole-job
limit `VILLAS_BACKUP_MAX_JOB_SECONDS` is at most 3600 seconds. These limits are not
RPO/RTO promises. A scheduled job that exceeds its limit exits for the service
supervisor to restart and records failure when the status volume is writable.

Failed partial snapshots are inspected by exact pending tag, host and path before
cleanup. Each pending tag contains a deadline. Later runs remove expired abandoned
pending snapshots after a two-minute grace; complete snapshots and other hosts/paths
are excluded. Metadata/cleanup failures remain failures, not claims that remote data
was absent or removed. Retention applies to completed snapshots under the selected
host/path. Configure separate repositories and unique host identities per environment.
Restic documents these [filter and retention rules](https://restic.readthedocs.io/en/stable/060_forget.html).

The reference supports an explicit HTTPS S3-compatible off-server repository. A local
absolute repository is accepted only with the guarded disposable rehearsal settings.
S3 credentials come from the named private JSON file. The process forwards only the
allowed credential fields and never inherits an operator's ambient AWS/GCP tokens.
Keep repository access and encryption recovery material outside the app host's sole
failure domain. Runtime/migration users do not receive backup repository credentials.

## Configure after D04

Add `deploy/backup.compose.yaml` to the selected environment's Compose files. Set an
immutable `VILLAS_BACKUP_IMAGE`, unique `VILLAS_BACKUP_HOST` such as
`villas-production-main`, and a confirmed `VILLAS_KEEP_DAILY` count. No retention
duration is assumed; the template still refuses to start without that choice.
Hourly retention defaults to zero. Daily recovery defaults are centralized in
`deploy/recovery-policy.mjs`. The scheduler profile is
`backups`, and the one-off command profile is `operations`.

In the private secrets directory, add `backup_repository`, `backup_password` and
`backup_credentials.json`. The repository file contains the explicit S3 HTTPS URL.
The credential JSON supports `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, optional
`AWS_SESSION_TOKEN` and `AWS_DEFAULT_REGION`. Follow the private-parent/file permissions
in the deployment guide. Never publish these values or source them from another project.

With explicit personal Docker context, project and private env file on every command:

1. Run the one-off `backup init` once for a new repository. Do not initialize over or
   delete an existing repository to recover from an error.
2. Run `backup backup`, then `backup verify` and `backup snapshots`. A successful
   backup updates private status; a failed run keeps the last completion time and
   records failure. `verify` reads repository data and checks integrity.
3. Record the snapshot ID/time, actual source Flyway version, source application/proxy
   digests and backup image digest in the private recovery inventory. Keep it off-host
   with recovery material. Snapshots include the complete Flyway history in the dump.
4. Start `backup-scheduler` under profile `backups`. Test a failed run and confirm
   actual alert delivery. Enable storage retention/cost monitoring for the chosen
   provider. Do not claim this is configured before exercising it.

The scheduler waits 23 hours after each completed/failed attempt, reserving up to
30 minutes for each of the current and next jobs inside the 24-hour loss target.
A full 24-hour delay would exceed that target once job runtime is included. Explicit
interval/job/age overrides are checked together before scheduling; an incompatible
combination fails closed. RPO still depends on successful runs and outages. The
24-hour recovery-time target includes operator response, restore, reconciliation and
safe reopening; local timings do not prove it. Status records completion and `protectedAt`
(before the database snapshot starts). The monitor uses `protectedAt` for age, so
a slow dump/upload does not make old data appear fresh. Missing snapshot-point
metadata is unhealthy until a new successful backup. Changing
backup host identity or repository requires a deliberate retention/recovery plan for
older snapshots. Recheck restore regularly and after schema/runtime changes.

## Isolated restore procedure

1. Close public traffic and stop application/migration writers. Preserve failed
   volumes and private diagnostics. Identify the last verified snapshot and reconcile
   later external payments. Never truncate or overwrite the failed database.
2. Use **standalone** `deploy/restore.compose.yaml` with a new explicit project, such
   as `villas-restore-UNIQUE`, and a new volume. Do not combine it with production
   startup or point it at the production volume. It publishes no ports and starts
   no web application.
3. Keep an absolute private restore env file with source backup configuration at
   `VILLAS_SECRET_DIR`, new DB secrets at `VILLAS_RESTORE_SECRET_DIR`, original
   `VILLAS_BACKUP_HOST`, the full completed `VILLAS_RESTORE_SNAPSHOT_ID`, and tested
   application/backup/MariaDB image digests. Generate new DB passwords rather than
   copying the failed runtime credentials. Repository/encryption credentials remain
   those needed to read the selected source snapshot.
4. Start `restored-db`, then run the one-off `restore` service under `operations`.
   The target must have **zero schema tables** before import, not merely zero bookings.
   A populated target is refused without overwriting it. Failed imports remain
   quarantined and must not start a web app. Preserve the failed target for diagnosis;
   use another new target for a fresh attempt.
5. A successful import atomically deletes restored JDBC sessions, increments all
   staff security generations and appends a V15 recovery event containing snapshot
   ID, revoked session/staff counts and UTC time. The importer exits on SQL failure;
   failure to commit quarantine leaves the target closed. V15 is the first supported
   backup release; no historical production import is required.
6. Record the restored Flyway version, validate using the compatible source image,
   then rehearse any required forward migration before changing the selected image.
   The one-off `validate-schema` service runs Flyway with separate migration access.
   There are no down migrations, clean/baseline shortcuts or automatic safe rollbacks.
7. Reconcile rooms, guests, reservations/allocations, accepted nightly prices,
   payments/refunds/reversals, balances, saved operation results and audit continuity.
   Counts alone do not prove integrity. The local release rehearsal compares all
   business/configuration/history contents and separately verifies expected session,
   staff-generation and appended recovery-event changes.
8. Review the current staff and pending invitation list with the Owner, including
   revocations made after the backup. Restore can recover earlier account state.
   Review externally completed payments and any lost post-snapshot booking changes
   before allowing writes. Do not automatically retry old operations after data loss.
9. Apply reviewed runtime grants and configure the chosen app against the recovered
   database only after reconciliation. Prove the old cookie fails and a current
   invited Owner can sign in again through real Google. The local rehearsal proves
   this with the guarded synthetic provider; it does not satisfy the real provider gate.
10. Record measured restore/validation time, actual snapshot age, unresolved loss
    and Owner acceptance. Take and verify a new backup before reopening writes, then
    confirm monitoring and scheduled protection resumed. Update the private inventory.

Keep dumps, row-level evidence, credentials and real guest records out of git, GitHub,
logs and screenshots. Timed local rehearsal demonstrates the procedure on synthetic
data, not off-server availability, production performance or the approved RTO.
