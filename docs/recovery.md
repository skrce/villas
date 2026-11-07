# Recovery

Off-server destination, retention, recovery point objective (maximum lost data) and
recovery time objective remain open under D04. No off-server backup/restore acceptance
has occurred. A Docker volume or retained demo is not a backup. Track evidence in
[release-checklist.md](release-checklist.md).

1. Close traffic and stop all app/migration writers. Preserve failed volumes/logs.
2. Select a verified encrypted off-server snapshot. Record completion time, schema
   and image digests. Reconcile later externally completed payments before resuming.
3. Restore to a new isolated empty DB/volume without a public app, using the matching
   pinned MariaDB client. Never overwrite a populated target.
4. Validate Flyway checksums and app/schema compatibility. DDL may commit partially;
   do not clean, baseline or repair unexplained history to force a pass.
5. Invalidate restored server sessions and increment staff security generations before
   opening access. Keep identity/invitation/audit history. Prove old cookies fail and
   a current invited Owner can sign in through Google again.
6. Reconcile rooms, guests, bookings/allocations, accepted nightly prices, payments,
   refunds/reversals, balances, saved operation results and audit continuity. Counts
   alone do not prove booking or financial integrity.
7. Record measured recovery time, snapshot age, unresolved loss and Owner acceptance.
   Reopen writes after reconciliation and a verified backup; resume alerts/scheduling.

Keep exports/evidence outside git. The repository and encryption recovery material
must survive loss of the app host, with separate restricted credentials. Coordinate
backup with migrations: MariaDB's
[`--single-transaction` documentation](https://mariadb.com/docs/server/clients-and-utilities/backup-restore-and-import-clients/mariadb-dump)
describes InnoDB consistency and warns against concurrent DDL during a dump.
