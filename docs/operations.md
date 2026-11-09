# Operational signals and alerts

The selected [Cloud Run + Neon setup](cloud-run-neon.md#backups-recovery-and-signals)
uses fixed application logs and provider metrics/alerts. Cloud mode denies all
`/internal/**` HTTP endpoints; `/health` is data-free. Offline schema checks and
GCS metadata freshness jobs replace continuous database readiness polling. The
private-loopback monitor described below remains the Docker Compose reference.

Operational ownership, actual alert destination and deployed verification remain open
under D04. The repository provides private counters, bounded logging, a monitor and
local synthetic delivery tests. It has not sent a real operational alert.

## Privacy and health

Production suppresses arbitrary server/ORM/driver logs. Fixed operational categories
are logged without request paths, query strings, IDs, guest data, amounts, credentials
or exception text; repeated failure categories log at most once per 30 seconds.
Docker logs have size/file limits. Local synthetic mode retains development logs.
Unexpected HTTP errors return a generic reconciliation instruction. They never claim
that a write did not happen. Offline CLI startup failures omit stack traces/private
values and exit nonzero. Debug production only through deliberate private inspection.

`/internal/health/live` answers process liveness. `/internal/health/ready` requires DB
access and the bundled successful SQL migration versions. `/internal/metrics` emits
fixed counters only. All are hidden at the public proxy. The monitor shares the app's
private network namespace and uses loopback HTTP. Do not publish the API/DB or add a
public exception for these endpoints.

| Counter | Meaning |
| --- | --- |
| `villas_http_requests_total` | HTTP requests excluding internal probes |
| `villas_auth_failures_total` | Rejected authentication/authorization and failed OIDC handoffs |
| `villas_booking_write_rejections_total` | Reservation write responses rejected below 500, including expected conflicts |
| `villas_booking_write_failures_total` | Reservation writes that returned 500 or raised an unhandled error |
| `villas_database_failures_total` | Observed readiness/database failures |
| `villas_service_failures_total` | Requests returning 500 or raising an unhandled error |

The private monitor cannot detect broken public DNS, TLS or a failed proxy while the
API remains healthy. The chosen environment also needs an external HTTPS availability
check and verified alert delivery. That setup is part of D04/deployed acceptance.

Counters reset on app restart and are operational signals, not business reports.
There are no dynamic metric labels. Public assets may contribute request counts;
internal checks do not extend staff sessions.

## Monitor and delivery

`deploy/backup.compose.yaml` provides the `monitor` service under profile `monitoring`.
It requires `VILLAS_DEPLOY_ENVIRONMENT` (staging/production). Maximum protected-data
age defaults to the approved 24 hours; `VILLAS_BACKUP_MAX_AGE_SECONDS` can explicitly
override it after a policy change. It reads the private backup status volume and its own
persistent baseline. Start/recreate it with the app when the namespace changes.

Each minute it checks liveness, readiness, required counter availability, backup
success/age and new failures since the prior baseline. Five new auth failures or one
new failed booking/database/service signal raises the corresponding condition. Expected
booking conflicts have a separate counter and do not raise the failed-write alert.
Age uses the conservative database snapshot point, not upload completion time.
Missing snapshot-point metadata, an unreadable/future-dated status or a stale backup
is unhealthy. The first
probe establishes a counter baseline, and counter resets are tolerated.

Configure a private `alert_url` file only after selecting and authorizing the receiver.
The endpoint must accept HTTPS POST with this JSON contract:

```json
{"id":"opaque-uuid","app":"villas","environment":"production","state":"alert","conditions":["backup_stale"],"at":"UTC-instant"}
```

The `Idempotency-Key` header equals `id`. Unconfirmed retries preserve the entire
original envelope, including timestamp. Current probe time is stored separately.
The payload never includes raw errors, URLs, guest or financial data. Redirects are
rejected. A 2xx means the receiver accepted the event; a timeout, 5xx or transport
failure remains unconfirmed. The receiver must deduplicate by the stable ID.

Unchanged accepted states stay quiet. Pending envelopes are persisted before delivery
and stay at the front until the receiver accepts them, even if the condition clears.
Later state changes queue behind them. The monitor sends at most one event per poll.
Its queue is bounded at 32 events: during a prolonged outage, unsent transitions are
coalesced by failure category, followed by the latest state. The attempted front
envelope is never changed. Coalesced alerts add `"coalesced":true`; they summarize
failures observed while delivery was unavailable. Current health, pending count and
delivery progress remain separate. An unreadable pending queue fails closed and
preserves its file for private repair.
Run one monitor writer per status volume. Stop watch mode before running a manual
one-off probe against that same volume.

Failed/unconfigured delivery remains pending. A service that needs another message
format requires an explicit adapter. Do not assume this generic envelope works with
an arbitrary email, chat or paging API. The only exercised destination is an owned
loopback synthetic receiver, guarded by explicit rehearsal settings.

## Operator response

| Signal | First action |
| --- | --- |
| Service/readiness/metrics unavailable | Check private container status, DB health, migration/image compatibility and resource limits. Keep writes closed if recovery is uncertain. |
| Booking failures | Preserve the original operation key and reconcile outcome before any retry. Check the private service/DB state. |
| Authentication failures | Check Google client/origin configuration, current invited accounts, clock and provider availability without recording tokens/emails. |
| Backup failure/staleness | Inspect private repository/credential/capacity state, run a controlled backup/verify and restore test, and disclose the actual last protected time. |
| Unconfirmed alert delivery | Check the receiver privately and retry the same event ID/envelope. Do not claim no notification was delivered. |

Assign a primary responder and alternate, confirm real alert/recovery delivery and
record escalation contact details privately before launch. Exercise DB outage, failed
booking/authentication, backup and service failure paths in selected staging. Local
checks do not prove the production receiver or on-call response.
