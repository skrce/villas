# Release checklist

Milestone 10 is in preparation. Local verification, successful images and deployment
commands are distinct from deployed acceptance. Keep [issue #11](https://github.com/skrce/villas/issues/11)
consistent with this record. [Real Google acceptance](https://github.com/skrce/villas/issues/4)
is still open.

| Gate | Required evidence | Status |
| --- | --- | --- |
| Environment | Owner-approved personal host, domain, TLS, budget, availability and operational owner | Pending D04 |
| Secrets | Separate staging/production clients/accounts, private mounts and rotation/recovery access | Prepared; actual configuration pending |
| Exact revision | Backend/native DB/frontend/generated/browser checks and independent review | Pending release revision |
| Package | Verified JAR/dist, image digests, restricted runtime, routing/cookies/private health | PR #38 merged after full local/CI verification; recovery image/rehearsal evidence in #11 |
| Deployment automation | Explicit provider/environment, tested digests, restricted/short-lived credentials where supported | Pending provider choice |
| Empty production | New DB, validated migrations, zero business/staff records before invitation | Actual environment pending |
| Google/access | Real callback, secure cookie, CSRF/Origin, logout, expiry, invites and revocation | Setup deferred; actual verification pending |
| Backups | Approved retention/RPO/RTO, encrypted off-server storage, scheduler and failure alert | Tools/local encrypted repository qualified; actual policy/storage/schedule pending D04 |
| Restore | Timed isolated restore, financial/record/audit reconciliation, stale session rejection | Local synthetic rehearsal implemented; actual off-server target/acceptance pending |
| Upgrade | Prior-schema preservation/rerun, failure handling and compatible rollback/forward fix | V14-to-V15/rerun/quarantine failure tests and isolated restore; selected environment pending |
| Operations | Privacy-safe signals, DB/auth/booking/backup/service alerts, verified delivery and response owner | Private signals/local receiver tested; actual destination, external availability check and ownership pending |
| Staff pilot | Desktop/phone booking conflicts/retry, repricing, cancellation, deposits/refunds, stay operations, cleaning and reports | Pending deployed Owner pilot |
| Production smoke | Actual HTTPS/login, private API rejection, empty start, readiness and fresh backup | Actual environment pending |

For each executed gate record the date, full revision, digests, environment, commands,
results, reviewer and accepting Owner. Keep private operational evidence outside git.
GitHub receives synthetic/redacted summaries, never exports, secrets, cookies or guest
records. Record measured restoration time separately from the recovery target.
Keep the issue/milestone open until every mandatory gate is demonstrated.
