# Release checklist

The Owner superseded the per-business layout with a shared app and database per
environment. Follow [the tenancy contract](contracts/multi-tenancy.md) and #44-#49.
Shared identity, explicit business data access and PostgreSQL row security are
implemented, including explicit browser business selection and isolated state (#47). The operational reference still has a
configured compatibility recovery target. Live Terraform commands are blocked before authentication until #48
replaces the topology. Do not use the earlier setup instructions below to provision
resources or treat them as shared-tenancy qualification.


Milestone 10 is in preparation. Local verification, successful images and deployment
commands are distinct from deployed acceptance. Keep [issue #11](https://github.com/skrce/villas/issues/11)
consistent with this record. [Real Google acceptance](https://github.com/skrce/villas/issues/4)
is still open.

Frankfurt setup and routine upgrades follow [Cloud Run + Neon](cloud-run-neon.md).
Templates/mock-provider checks, image publication, actual provisioning, live Google,
delivered alerts, timed off-server restore and the Owner pilot are separate evidence.
Custom domain remains deferred; provider HTTPS is sufficient for the first release.

| Gate | Required evidence | Status |
| --- | --- | --- |
| Environment | Owner-approved personal host, domain, TLS, budget, availability and operational owner | Frankfurt Cloud Run + Neon confirmed; actual resources and live verification pending |
| Secrets | Separate staging/production clients/accounts, private mounts and rotation/recovery access | Prepared; actual configuration pending |
| Shared tenancy | Independent memberships, authorized request context, row security, browser switching, controlled onboarding and two-business isolation | #44 registry, #45 shared identity, #46 data isolation and #47 browser workspaces implemented; #48/#49 pending |
| Exact revision | Backend/native DB/frontend/generated/browser checks and independent review | Pending release revision |
| Package | Verified JAR/dist, image digests, restricted runtime, routing/cookies/private health | PR #38 merged after full local/CI verification; recovery image/rehearsal evidence in #11 |
| Deployment automation | Explicit provider/environment, tested digests, restricted/short-lived credentials where supported | Provider architecture confirmed; setup pending |
| Empty production | New DB, validated migrations, zero guest/room/booking/ledger/staff records before invitation; registry metadata is expected | Actual environment pending |
| Google/access | Real callback, secure cookie, CSRF/Origin, logout, expiry, invites and revocation | Setup deferred; actual verification pending |
| Backups | Approved retention/RPO/RTO, encrypted off-server storage, scheduler and failure alert | D15 daily/seven-day retention/24-hour loss/24-hour recovery confirmed; actual storage/schedule/alerts pending |
| Restore | Timed all-business restore and selective business recovery, financial/record/audit reconciliation, stale session rejection | Single-business local reference implemented; shared local and off-server qualification pending |
| Upgrade | Prior-schema preservation/rerun, failure handling and compatible rollback/forward fix | PostgreSQL transactional migration/rerun/quarantine tests and isolated restore; hosted qualification pending |
| Operations | Privacy-safe signals, DB/auth/booking/backup/service alerts, verified delivery and response owner | Private signals/local receiver tested; actual destination, external availability check and ownership pending |
| Staff pilot | Two-business desktop/phone isolation, booking conflicts/retry, repricing, cancellation, deposits/refunds, stay operations, cleaning and reports | Pending deployed Owner pilot |
| Production smoke | Actual HTTPS/login, private API rejection, empty start, readiness and fresh backup | Actual environment pending |

For each executed gate record the date, full revision, digests, environment, commands,
results, reviewer and accepting Owner. Keep private operational evidence outside git.
GitHub receives synthetic/redacted summaries, never exports, secrets, cookies or guest
records. Record measured restoration time separately from the recovery target.
Keep the issue/milestone open until every mandatory gate is demonstrated.
