# Maintainer and LLM context

Read this file at the start of a change. It describes the current app; detailed
contracts and the linked GitHub issues remain authoritative for their own domains.
Update this guide whenever behavior, setup or release status changes.

## Read in order

First confirm that the remote is `skrce/villas` and inspect
`git status --short --branch`. Identify existing work before creating a `codex/`
branch. Then read:

1. [AGENTS.md](../AGENTS.md): repository rules, checks and private-state safety.
2. [Release decisions](decisions.md): confirmed business policies and open inputs.
3. [Implementation tracker](implementation.md): ten milestones and recorded evidence.
   Check the linked issue and current PRs before starting work.
4. [Shared tenancy](contracts/multi-tenancy.md) and the relevant [API](contracts/api.md), [reservations](contracts/reservations.md),
   [pricing](contracts/pricing.md), [payments](contracts/payments.md),
   [front-desk](contracts/front-desk.md), [housekeeping](contracts/housekeeping.md),
   [reporting](contracts/reporting.md) or [permissions](contracts/permissions.md) contract.
5. [README](../README.md), [frontend guide](frontend.md) and
   [security setup](security.md) for the environment being changed.

This is the standalone `skrce/villas` repository. A Codex session can open here from
another project. Do not apply another repository's build system, credentials, ports,
database or deployment assumptions.

The implementation tracker contains historical checkpoints. Use its top status
table, the linked issue and current PR/CI evidence to determine what remains. Old
test counts or an earlier "in progress" paragraph do not verify a new revision.

## Product and release status

Villas is a responsive staff app for accommodation businesses, initially in North Macedonia.
The Owner approved a shared app/database per environment. The current runtime remains
single-business during [the six-step tenancy conversion](contracts/multi-tenancy.md),
tracked in #44-#49. The #44 schema foundation precedes shared login, request/RLS and browser work.
Owners are the only implemented role. Public booking, guest accounts, online payment
processing and additional staff roles are outside the initial plan.

Milestones 1 through 7 have local implementation, independent review and merge
evidence. Milestone 8 implements daily front desk, stay operations, manual settlement and
housekeeping. Its integrated review, verification and merge evidence are recorded in
[issue #9](https://github.com/skrce/villas/issues/9) and [PR #34](https://github.com/skrce/villas/pull/34). Milestone 9 implements the Today dashboard and
reconciled reports, with implementation and verification evidence in
[issue #10](https://github.com/skrce/villas/issues/10), [PR #36](https://github.com/skrce/villas/pull/36)
and [PR #37](https://github.com/skrce/villas/pull/37).
Milestone 10 is active for portable deployment packaging, backups/recovery, deployed
checks and the staff pilot. Read [deployment](deployment.md), [recovery](recovery.md)
the [operations guide](operations.md) and [release checklist](release-checklist.md)
before release work. Packaging and recovery are merged in
[PR #38](https://github.com/skrce/villas/pull/38) and [PR #39](https://github.com/skrce/villas/pull/39).
[PR #40](https://github.com/skrce/villas/pull/40) applies the approved daily recovery
policy with scheduler runtime headroom and a 24-hour protected-data age default.
Recovery/monitoring use isolated local qualification; selected-host/off-server/real
Google/pilot acceptance remains open in #11 and #4.

Milestone 3's real Google setup and live-provider acceptance were explicitly deferred
by the Owner. [Issue #4](https://github.com/skrce/villas/issues/4) remains open for
those checks. Local synthetic OIDC success does not satisfy them. The Owner approved
Cloud Run + Neon PostgreSQL in Frankfurt on November 8, 2026, using the same personal
accounts as ABL with separate Villas resources. The Owner subsequently approved
one shared app/database per environment, superseding resources per business. Daily encrypted backups
are retained seven days, with 24-hour loss/recovery targets. Actual resource setup,
monitoring ownership and live verification remain open. No cloud deployment or
production/pilot acceptance is implied by the local demo.

For the next release session, inspect #11 and the current PR/CI heads first. Follow [Cloud Run + Neon](cloud-run-neon.md), the confirmed
D04 architecture and [PostgreSQL transition](postgresql-transition.md); configure
the shared tenancy steps #44-#49 before provisioning. The earlier cloud templates
are superseded and the live wrapper is blocked. Set up one Villas-specific Google
client per environment under #4 when the Owner is ready. Configure separate staging/production
secrets and off-server protection, qualify external availability/alert delivery,
then perform deployed Google/recovery checks and the Owner pilot. Production starts
empty. Do not copy a local/demo volume into it. The release checklist is the launch
gate even when all implementation PRs are merged.

## Rules that must survive a refactor

- Invited Google identity creates server-side sessions. No production password login,
  public signup or fallback administrator password. Accounts can invite more Owners.
  Sessions expire after at most seven days or three inactive days; revocation applies
  to protected requests and business writes.
- Property dates are `Europe/Skopje` calendar days, including DST. Event timestamps
  are UTC with database microseconds. Do not use the browser or JVM default timezone
  for admission or departure decisions.
- New prices and ledger amounts use exact integer EUR cents within the supported
  safe-integer range. Database event/ledger IDs are decimal strings in JSON. Do not
  convert their large values to JavaScript numbers.
- Production starts empty. Rooms, rates and real bookings are entered later. Old
  fixture price integers have no established EUR meaning and must not be converted.
- Guest first/last names are required; contacts are optional. Shared contacts do not
  merge people. Keep guest data and credentials out of GitHub, logs and screenshots.
- Base nightly rates have dated seasonal replacements. A price covers any party
  within capacity. No added taxes, fees, discounts, minimum stays or manual overrides.
  A real room/date/party change requires explicit acceptance of a current-rate quote
  for the whole stay. Every previous agreement remains in history. No-ops do not reprice.
- Check-in is within booked dates, before departure day, into a clean, physically
  vacant room. There is no readiness override. Checkout is on the agreed departure
  day; early/late departure requires an accepted date change first. No-show is a
  reasoned Owner action after arrival day, never an automatic job.
- Checkout marks the current room dirty atomically. In-house moves retain previous
  room nights, allocate remaining nights to the destination and dirty the old room.
  Availability/calendar use dated allocations; the current room also tracks physical
  occupancy, including overdue stays. Completed stays reject ordinary edits and have
  a reasoned, audited actual-time correction path with explicit DST choices.
- Payments are external cash/card/bank transfers already completed elsewhere. Support
  deposits, partial settlement and overpayments as credit. Refunds allocate an
  unreversed receipt and cannot exceed its remaining funds. Mistakes use linked full
  reversals with a reason; correcting a record does not return money.
- Cancellation/no-show sets accommodation owed to zero, retains agreements/entries
  and leaves held funds as credit until a separately recorded manual refund. Nothing
  automatically charges a fee or processes a refund. Checkout can acknowledge an
  outstanding/unknown balance, but never invents a payment.

## Code map

| Concern | Starting points |
| --- | --- |
| Application/configuration and HTTP security | `src/main/kotlin/com/villarosa/Application.kt`, `SecurityConfiguration.kt`, `security/` |
| Scoped models, repositories and versioned migrations | `src/main/kotlin/com/villarosa/repository/`, `src/main/resources/db/postgresql/` |
| Atomic inventory changes and reconciliation | `service/OperationCoordinator.kt`, `service/InventoryWriter.kt`, `repository/InventoryRepository.kt` |
| Stay phases, actual times and dated room assignments | `service/StayOperations.kt`, `service/RoomAllocations.kt`, `controller/StayOperationsController.kt` |
| Rates, immutable quotes and agreements | `service/QuoteService.kt`, related rate/price services and the pricing contract |
| External settlement | `service/LedgerService.kt`, `controller/LedgerController.kt`, the payment contract |
| Cleaning, daily lists and calendar snapshots | `service/ReadinessService.kt`, `service/DailyOperations.kt`, `service/BookingCalendar.kt` |
| Today, current corrected reports and bounded CSV | `service/TodayDashboard.kt`, `service/PeriodReports.kt`, `service/ReportingStore.kt`, `controller/ReportingController.kt` |
| Routed React workspace and sessions | `frontend/src/app/`, `frontend/src/api/session.ts`, `frontend/src/api/client.ts` |
| Initial Today view, period filters, source reconciliation and CSV downloads | `frontend/src/features/reports/`, `docs/contracts/reporting.md` |
| Record screens and responsive controls | `frontend/src/features/`, `frontend/src/shared/ui.tsx`, `App.css`, `index.css` |
| Safe browser mutations and drafts | `api/bookingActions.ts`, `ledgerActions.ts`, `readinessActions.ts`, `stayActions.ts`; `shared/useSave.ts`, `useDraft.ts`, `useVersionedDraft.ts` |
| Generated API contract/client | `frontend/openapi.json`, `frontend/src/api/generated/`, `ApiContractTest.kt`, `scripts/sync-openapi.mjs`, `generate-api.mjs` |
| Local process/database ownership | `scripts/local-db.mjs`, `dev-db.mjs`, `run-api.mjs`, `demo.mjs`, `e2e.mjs` |
| Release image, secrets, SPA, health and isolated container rehearsal | `deploy/`, `scripts/build-release.mjs`, `release-check.mjs`, `PrivateSettings.kt`, `ReleaseHttp.kt` |
| Frankfurt setup, phased workload creation, keyless publication and operator rollout | `deploy/cloud/`, `.github/workflows/release.yml`, `scripts/cloud-*.mjs`, `publish-release.mjs`, `docs/cloud-run-neon.md` |
| Encrypted streams, isolated restore, session quarantine and privacy-safe alerts | `deploy/backup.mjs`, `backup.compose.yaml`, `restore.compose.yaml`, `recovery-quarantine.sql`, `monitor.mjs`, `ops/OperationalSignals.kt` |

Backend paths in the table are relative to `src/main/kotlin/com/villarosa/` unless
fully prefixed. Use `rg --files` to locate a renamed class rather than assuming this
map proves the current filename.

## Test map

| Change | Regression starting points |
| --- | --- |
| Sessions, staff and revocation | [StaffAuthenticationIT](../src/test/kotlin/com/villarosa/StaffAuthenticationIT.kt), [StaffAuthorityIT](../src/test/kotlin/com/villarosa/StaffAuthorityIT.kt), [session tests](../frontend/src/api/session.test.ts) |
| Inventory, calendar and pricing | [InventoryIT](../src/test/kotlin/com/villarosa/InventoryIT.kt), [BookingCalendarIT](../src/test/kotlin/com/villarosa/BookingCalendarIT.kt), [BookingQuotesIT](../src/test/kotlin/com/villarosa/BookingQuotesIT.kt), [staff browser workflows](../frontend/e2e/staff-workflow.spec.ts) |
| Payments and financial recovery | [ManualLedgerIT](../src/test/kotlin/com/villarosa/ManualLedgerIT.kt), [payment interactions](../frontend/src/features/reservations/payments.test.tsx), [payment browser workflows](../frontend/e2e/payments.spec.ts) |
| Stay operations and housekeeping | [StayOperationsIT](../src/test/kotlin/com/villarosa/StayOperationsIT.kt), [RoomAllocationsIT](../src/test/kotlin/com/villarosa/RoomAllocationsIT.kt), [RoomReadinessIT](../src/test/kotlin/com/villarosa/RoomReadinessIT.kt), [stay](../frontend/e2e/stay-operations.spec.ts) and [housekeeping](../frontend/e2e/housekeeping.spec.ts) browser workflows |
| Reports and private downloads | [ReportingIT](../src/test/kotlin/com/villarosa/ReportingIT.kt), [report interactions](../frontend/src/features/reports/reports.test.tsx), [report browser workflows](../frontend/e2e/reporting.spec.ts) |
| Schema and restore | [MigrationsIT](../src/test/kotlin/com/villarosa/MigrationsIT.kt), related `*MigrationIT.kt` files, [RecoveryMigrationIT](../src/test/kotlin/com/villarosa/RecoveryMigrationIT.kt), [container rehearsal](../scripts/release-check.mjs) |
| Shared mutation handling and release tools | [useSave tests](../frontend/src/shared/useSave.test.tsx), [action adapters](../frontend/src/api/), [launcher/artifact/backup/monitor/policy tests](../scripts/) |

Kotlin `*IT.kt` cases use native PostgreSQL; unit and HTTP tests are also under
`src/test/kotlin/`. React tests sit beside their source. The full command below owns
test ordering and generated-client verification. Add a regression for the changed
behavior rather than treating the files in this table as exhaustive coverage.

## Transactions, stale data and retries

Business mutations check current Owner membership and property scope inside the
transaction. They serialize on the Owner, relevant guest, sorted affected room rows
and reservation as appropriate. Preserve those locks when changing a call path.
Reviewed versions are required; optimistic version checks do not replace inventory
locks. Writes, immutable events, audit, quote acceptance and the saved operation
result commit together. Test rollback, stale updates and competing writes in PostgreSQL.
Reads that combine a booking, balances or room allocations use consistent snapshots.

Reports are current corrected views, not historical as-of accounting. Occupancy is
booked room nights against the current active room roster, with that capacity
limitation disclosed. Charges use saved accepted nightly lines; collections use
effective ledger dates and omit reversed entries from money totals; balance reports
select overlapping stays and show their whole current position. Keep unknown prices
explicit. Derive money from the accepted reservation price snapshot, never a separate
quote-table total. Bounded exports recheck the reviewed content hash, preserve empty
report metadata, omit contacts and protect formula/precision-sensitive text. Import
columns as text. Do not persist reports in browser storage or publish real CSV files.

A lost response may hide a committed write. Preserve the original UUID key, reviewed
versions and quote before retrying. Reconcile the operation's historical result,
including its actor/event proof; current record state cannot prove a previous action.
Read-only recovery stays reachable after cancellation, checkout, correction or room
archival. New writes always require explicit review after stale data or sign-in.

The browser stores only hashed intent identities, opaque keys, original versions and
quote IDs, under Web Locks. Raw reasons, money, guest data and form fields remain in
same-Owner memory drafts. Persistent metadata is not a backup of those fields: after
a full reload an Owner may need to re-enter the original details for recovery. Do
not automatically submit on reconnect or authentication recovery. Shared `useSave`
protects session generations and latches a completed mutation before invalidation.
After-await UI/cache/draft side effects belong in its guarded completion callback.

## Run and verify

Use pinned versions from `.java-version`, `.node-version`, `terraform-version.txt`, `frontend/package.json`
and the checked-in Maven wrapper. From this repository, with Docker available:

```sh
npm --prefix frontend ci
./mvnw spotless:apply
node scripts/check.mjs
```

The full check also requires the pinned Terraform binary (`VILLAS_TERRAFORM_BINARY`
may supply its absolute path). Cloud validation uses mock providers without a
backend or account. The full check runs clean Maven verification, native PostgreSQL migrations/concurrency
checks, OpenAPI/client drift checks, frontend formatting/lint/coverage/build, owned
launcher tests and Chromium against the packaged API, disposable PostgreSQL and synthetic
OIDC. Do not replace native tests with H2 or silently skip them. For a contract change,
verify the backend, run `node scripts/sync-openapi.mjs --write`, then
`npm --prefix frontend run generate:api`; review and commit the complete generated
snapshot/client together. Never hand-edit generated code.

The browser runner owns fixed ports 15073/19098/19108. Run one browser/full gate at a
time on a machine. It removes only its random private database and state. Its external
test-only clock JAR can advance property days for the full-stay test; the fixture is
compiled from test sources and is absent from the application JAR. It has no HTTP
control endpoint and is never loaded by the regular/demo launcher.

The demo uses its own retained database and synthetic identity. See the README for
start/stop and custom-port commands. Each checkout's `.local-state/` is private and
path-bound. Never copy it to another worktree, delete it while keeping the volume,
prune Docker or stop a process owned by another project. Repackage the application
before expecting merged backend changes to appear in a packaged demo.

## Delivery checklist

For an ordinary app update, follow [the later-change release procedure](deployment.md#releasing-a-later-change).
CI checks/rehearses images and validates cloud templates with mock providers. The
[Cloud Run + Neon guide](cloud-run-neon.md) owns keyless registry publication and
the explicit staging/production operator rollout. The publisher cannot deploy or
read secrets. The earlier per-business Frankfurt templates retain local reference checks,
static maintenance and runtime database fencing, but the operator wrapper blocks
live use until #48 replaces their topology. [The tenancy contract](contracts/multi-tenancy.md)
is authoritative for the shared target and implementation status. Actual resources,
Google clients, alert delivery, off-server recovery and the pilot remain open.
Villas uses personal resources separate from ABL. Businesses share the Villas resources within each environment.

Use a `codex/` branch and small PRs linked to the active milestone. Keep an independent
review on each PR, address material findings, run required checks and merge only after
CI passes for the final head. Update this guide, the relevant contracts, implementation
tracker and GitHub checklist with verified behavior. Cite exact revisions and commands
in the PR/issue rather than repeating historical metrics here. Keep local automation,
real Google, deployment/recovery and Owner acceptance as separate statuses.

Keep each kind of context in its owning file. README explains setup and points here;
AGENTS.md holds concise working rules; this guide holds current architecture/status
and code/test maps. Record Owner decisions in `decisions.md`, behavior in the relevant
contract, and exact-head validation/review evidence in the PR and milestone issue.
Deployment, recovery and operations procedures have their own linked runbooks.
When hosting or live acceptance changes, update those files and the release checklist
in the same delivery. Never store private operator state or credentials in the handoff.
