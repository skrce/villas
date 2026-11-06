# Implementation tracker

The owner approved milestones 3 and 4 in sequence after milestone 2. The plan is a
staff-only application. Google sign-in, EUR, `Europe/Skopje`, and an empty production
start are recorded in [decisions](decisions.md).

## Ten-step plan

| Step | Issue | Dependencies | Implementation state |
| --- | --- | --- | --- |
| 1 | [Modernize the foundation and establish regression checks](https://github.com/skrce/villas/issues/2) | None | Implemented and verified; review/merge evidence is in the linked issue |
| 2 | [Migrate the database and make bookings concurrency-safe](https://github.com/skrce/villas/issues/3) | 1 | Implemented and locally verified; final review/merge evidence is in the linked issue |
| 3 | [Implement secure staff accounts and permissions](https://github.com/skrce/villas/issues/4) | 1, 2 | Local implementation reviewed, verified and merged in PRs #18 and #19; live Google setup explicitly deferred |
| 4 | [Build the routed staff interface and reusable UI](https://github.com/skrce/villas/issues/5) | 1, 3 | [Implemented and independently reviewed in PR #20](https://github.com/skrce/villas/pull/20); final merge/CI evidence is in the linked issue |
| 5 | [Deliver guest and room management](https://github.com/skrce/villas/issues/6) | 2, 3, 4 | Backend PRs #21/#22 merged after review and CI; integrated UI verified locally, final review/merge evidence is in the linked issue |
| 6 | [Implement seasonal rates and saved booking quotes](https://github.com/skrce/villas/issues/7) | 2, 3, 4, 5 | Planned |
| 7 | [Deliver the reservation calendar and booking workflow](https://github.com/skrce/villas/issues/8) | 2, 3, 4, 5, 6 | Planned |
| 8 | [Complete front-desk operations, payments, and housekeeping](https://github.com/skrce/villas/issues/9) | 2, 3, 4, 5, 6, 7 | Planned |
| 9 | [Deliver the Today dashboard and reconciled reports](https://github.com/skrce/villas/issues/10) | 3, 4, 5, 6, 7, 8 | Planned |
| 10 | [Verify production deployment, recovery, and the staff pilot](https://github.com/skrce/villas/issues/11) | 1-9 | Planned |

The first complete booking checkpoint is milestone 7. Milestone 8 completes daily
operations and manual settlement, milestone 9 adds reconciled reporting, and
milestone 10 verifies deployment/recovery and staff acceptance.

## Milestone 1 delivery

The work is stacked in review order:

1. [PR #12](https://github.com/skrce/villas/pull/12) fixes the DELETE/PATCH route and
   exception-handler regressions and establishes CI. Its 40 backend tests and
   frontend lint/build passed locally and in GitHub Actions.
2. [PR #13](https://github.com/skrce/villas/pull/13) upgrades through Spring Boot 3.5
   to 4.1, adopts springdoc/SecurityFilterChain, adds canonical `/api/v1` routes and
   production restrictions, and pins/verifies the Maven wrapper. Its 67 backend
   tests and frontend lint/build passed locally and in GitHub Actions.
3. [PR #14](https://github.com/skrce/villas/pull/14) adds isolated MariaDB bootstrap/fixtures, five native database
   checks, Vitest interactions, a full browser workflow, generated-contract/client
   drift checks, coverage artifacts, and shared contracts/setup instructions.
   The complete local command passed at `43e5043`, including the review fixes and
   72 backend cases. The subsequent Playwright interruption fix passes all six
   launcher tests, including the real CLI and its detached web server. Current CI
   results and test/coverage artifacts are linked from the PR.

The linked milestone issue records review resolutions and merge acceptance. Cloud
deployment and real Google verification are later milestone gates, not part of this
milestone's completion claim.

Independent review found a legacy trailing-slash regression, interruption cleanup
leaks, an empty-bootstrap assertion that cleared its evidence, and unsupported native
Windows batch execution. Legacy aliases now have request-level regressions. The
browser runner handles signals and preserves recovery state if Docker cleanup fails.
The bootstrap check reads untouched SQL counts before fixture cleanup. The supported
development platforms are explicitly Linux, macOS, and WSL. A deliberately seeded
schema now fails the bootstrap test. Reviewers rechecked the fixes before merge.

## Repeatable verification

`node scripts/check.mjs` is the full command. It runs the clean backend build and
MariaDB checks, verifies the runtime OpenAPI snapshot, installs frontend dependencies
from the lockfile, regenerates the client, checks drift, runs lint/interaction tests,
builds the frontend, and runs Chromium against its own database and packaged API.
See the README for one-time setup and individual commands.

The audit at `521411b` had 31 backend tests, 87.9% line coverage, 69.4% branch
coverage, and 61.9% reservation-service branch coverage. There were no frontend/browser
tests. The clean `node scripts/check.mjs` run at `43e5043` passed 67 unit/HTTP/configuration
tests, five MariaDB cases, six frontend interactions, five launcher checks, and one
Chromium workflow. A subsequent real-CLI interruption regression raises the launcher
checks to six. The measured backend baseline is 96.38% line and 73.00% branch
coverage. Reservation-service branch coverage is 71.43%. Frontend application coverage is 44.53% line
and 35.59% branch coverage. These figures do not imply full workflow coverage.
Generated frontend code is excluded from coverage; regeneration and real API/browser
interactions check it separately.

The November 5 dependency audit reports no high/critical npm findings. One moderate
Minimatch resource-consumption advisory affects seven packages in the development-only
TypeScript lint dependency chain. The latest pinned typescript-eslint still pulls
that dependency. No forced incompatible override or suppression is applied. Recheck
it with the frontend tooling work in milestone 4. Local checks and CI fail on new
high/critical npm findings via `npm audit --audit-level=high`.

Milestone 2 must add adversarial MariaDB tests for overlapping/concurrent bookings,
invalid dates, missing room/guest references, and migration/retry behavior. Milestone 6
must cover rate boundaries, exact cent arithmetic, rounding, and immutable quotes.
Milestones 3 and 8 must cover every permission denial and ledger retry. Target at
least 90% branch coverage for critical booking, authorization, and money modules as
those modules are implemented, with explicit tests for these failure cases. A global
percentage alone is not a release gate.

## Milestone 2 delivery

[PR #15](https://github.com/skrce/villas/pull/15) adds explicit ordered migrations,
strict calendar stays, reference constraints, and empty/upgrade/rerun checks. It is
merged after independent review. The review fixes reject zero date components even
under permissive SQL modes, enforce exact stored status values, and validate missing
room references before a foreign-key write. Backend verification passed 79
unit/HTTP/configuration cases and 10 MariaDB cases. Its complete check also passed
six frontend interactions, six launcher tests, and the browser workflow.

[PR #16](https://github.com/skrce/villas/pull/16) is merged with shared apartment locks,
expected versions, retained cancellation, maintenance, operation reconciliation, and
atomic events. Backend review independently verified outer-transaction suspension,
historical replay, and all mutation rollback paths. Frontend review found two gaps
in successful-response validation and shared retry state. The fixes confirm saved
operation outcomes, serialize storage updates across tabs, and clear only a matching
key. Independent re-review cleared both findings. The final PR revision passes 23
frontend tests and two real Chromium workflows, including a lost response across tabs.

The final query change adds database-bounded calendar/history pages, read indexes,
guest-count console fields, and stable date-input labels. It checks V3-to-V4 record
preservation and partial-DDL recovery without dropping saved bookings. Permanent
native regressions cover historical results after later edits and audit-failure
rollback for every inventory mutation. The milestone verification suite now contains
79 unit/HTTP/configuration tests, 46 native MariaDB tests, 24 frontend tests, six
launcher checks, and two Chromium workflows. The linked issue records the exact
verified revision and CI result before closure.

The raw JaCoCo report measures 92.82% backend line coverage and 72.69% branch coverage
at the query checkpoint. Strict dates have 100% branch coverage and bounded queries
have 90%. InventoryWriter has 95.80% line/71.15% branch coverage; OperationCoordinator
has 96.97% line/66.67% branch coverage. Those two remain below the 90% branch target;
retain the target as the full lifecycle is implemented rather than hiding the raw
report. The required native validation, rollback, replay, and concurrency cases pass.
The frontend retry adapter has 91.52% branch coverage. The basic console still needs
the broader interaction coverage and routed design planned in milestone 4.

Google identity, verified staff actors, business policies, accepted pricing, production
initialization, and backup/restore remain their own milestone gates. No live or
production acceptance is implied by the local checks.

## Acceptance states

| Evidence | Milestone 1 state | Release gate |
| --- | --- | --- |
| Unit/HTTP/configuration checks | All 67 pass in the clean combined run | Required for each change |
| Real MariaDB checks | Five pass, including empty production startup and authentication failures | CI required, never silently skip Docker |
| Frontend interactions | Six local cases pass | CI required |
| Launcher lifecycle | Six checks pass, including signals, real Playwright server cleanup, and cleanup failure recovery | CI required |
| Browser with real API/database | Chromium guest creation, room move, cancellation, and persistence checks pass locally and in CI | Extend through later workflows |
| Generated snapshot/client | Fresh generation and drift checks pass locally and in CI | Required for every API change |
| Real Google identity | Client setup and live acceptance explicitly deferred by owner | Milestone 3 remains open |
| Cloud deployment and recovery | Not performed; D04 remains open | Milestone 10 |
| Staff pilot | Not performed | Milestone 10 |

## Known limitations

Milestone 4 replaces the console with a routed responsive workspace. The schema has
versioned migrations, reference constraints, and strict calendar dates. Inventory
transactions, version checks, retry reconciliation, and bounded queries are implemented.
Cancellation retains the record and events. Price integers are fixture values, not the
implemented EUR-cent model. Owner accounts and server sessions are implemented locally. Rates, a ledger, and a
calendar remain planned. Real Google setup and verification remain open. These limitations are not relaxed by the new test setup.

## Milestone 3 local checkpoint

[PR #18](https://github.com/skrce/villas/pull/18) is merged after independent review.
The integration replaces Basic Auth with invited Google OIDC and native JDBC sessions,
requires CSRF/Origin on writes, rechecks current Owners inside business transactions,
and scopes operation recovery/audit actors to the canonical Owner. Guest writes and
normal searches use JSON. The browser deletes legacy credentials, rejects stale
responses, confirms logout by read-back and requires explicit resubmission after
reauthentication. Offline bootstrap/recovery creates only an expiring invitation.

The initial Owner email was supplied privately and must not be copied into source or
GitHub. The owner explicitly deferred Google client creation and live-provider checks.
Synthetic OIDC is loopback-only and rejected in production. Milestone 3 remains open
for real Google callback/cookie/logout/invitation/recovery acceptance. The verified
local checkpoint is the dependency for the authorized milestone 4 work.

The complete local check passed at `f492982`: 98 unit/HTTP/configuration cases,
86 native MariaDB cases, 40 frontend cases, six launcher cases and three Chromium
workflows. Backend independent re-review cleared the two session findings. A later
frontend-only notification correction adds the 41st case and keeps unconfirmed logout
hidden until explicit session recovery; its lint/build and browser checks are recorded
in PR #19. The PR records independent re-review and final CI before merge.

Raw branch coverage is 100% for StaffAccess and 93.62% for AuthenticationSettings.
StaffDirectory is 76.25%, StaffSessionFilter 70%, and the browser session module 83.03%.
These remain below the 90% critical-module target. Native adversarial checks cover
the required invitation/identity, revocation, concurrent writes, handoff failure,
CSRF, lifetime and rollback cases, but those checks do not erase the measured gap.
Continue filling boundary coverage during live-provider qualification and later
lifecycle work. No global percentage is substituted for those failure cases.

## Milestone 4 local implementation

The workspace now has separate routed features, keyed query state, validated forms,
shared accessible controls and phone record layouts. It replaces API settings and
manual ID entry with session login, guest search and room choices. Existing booking
creation, date edits, room moves, retained cancellation/history, guest lookup/creation
and Owner administration are wired to their real APIs. Future workflows are not shown
as placeholders or fake metrics. See [frontend conventions and demo](frontend.md).

The local demo works without Google setup in a separate synthetic database. Its
lifecycle checks cover occupied ports, signals, worker failure and retained state after
cleanup failure. Real Google and deployed acceptance remain separate open gates.
Final review and verification evidence will be recorded in the milestone issue/PR.

Milestone 4's complete local check passed at `4785517`: 184 backend cases (98
unit/HTTP/configuration and 86 native MariaDB), 54 frontend cases, 13 launcher
checks and six authenticated Chromium workflows. The browser run includes a lost
booking response followed by reload/re-entry/recovery, Owner invitation/session
revocation, keyboard dialogs, deep links and axe checks at desktop and 320px.
The actual Vite demo also passed synthetic sign-in, room loading and logout.

Two independent reviewers cleared the final implementation. Their original failure
probes are permanent tests: advisory availability cannot block reconciliation, login
generations remount query observers while retaining same-Owner drafts, and demo
process groups remain owned when a launcher exits before its descendants. Both
launcher suites now run in CI. The linked PR/issue records final CI and merge evidence.

Frontend coverage excludes generated code. At this checkpoint it measures
79.79% line/68.51% branch coverage. The booking retry adapter has 93.05%
branch coverage, the session module 83.92%, and the mutation helper 75%.
Session/mutation branches remain below the 90% critical-module target; required
adversarial cases pass and the raw gap stays explicit during later qualification.

## Milestone 5 delivery

The owner confirmed required first/last names and optional phone/email/address/notes
on November 6, 2026. [PR #21](https://github.com/skrce/villas/pull/21) is merged with
private combined Unicode name/phone queries, bounded directory/history, optional
normalized contacts, duplicate review, versioned editing and retained archive/restore.
Shared contacts never merge people. Guest archival and booking admission/date changes
share a guest lock; current/future active stays must be resolved before archival.

[PR #22](https://github.com/skrce/villas/pull/22) is merged with named room references,
capacity/bed/view/floor/features, versioned metadata/status, private JSON maintenance
and room-filtered bounded inventory reads. Capacity/archive changes serialize with
booking admission and return bounded links to affected reservations. V8/V9 preserve
existing records and resume partial DDL. No legacy price is converted into a real rate.

Independent reviews found and verified fixes for Unicode/prefix phone matching and
JSON fractions being truncated into capacities or edit versions. These are permanent
native/H2/HTTP regressions. Two reviewers cleared both final heads; exact-head CI
passed before merge. Additional independent probes exercised every V9 statement
prefix, concurrent reference creation and booking/archive/move/date/maintenance races.
The room checkpoint passes 142 unit/HTTP and 124 native cases with no skips.

The integrated frontend adds the guest/room directories and editable profiles, full
reservation history, archive/restore/conflict resolution links, inline walk-ins,
reference-labelled room choices and maintenance/history workflows. Reviewed versions
remain in the Owner's memory-only draft across reauthentication. Explicit Load latest
performs a fresh protected read. Unknown responses are not reported as confirmed;
no write repeats automatically. Maintenance retains the operation-key recovery contract
across tabs and reload, without persisting raw details. The fixture rooms now have
explicit synthetic names/references matching the same contracts as room administration.

Local frontend checks pass 71 cases. Nine real Chromium workflows verify these screens
against signed synthetic OIDC and private MariaDB, including stale edits, 51-record
pagination, family phones, duplicate review, capacity/archive/maintenance conflicts,
archive/restore/history, and recovery of a lost maintenance response across tabs/reload
without a second POST. Desktop/320px axe scans and attached screenshots pass. Final
complete-gate, independent review and merge evidence are recorded in the milestone issue.

Raw backend branch coverage is 100% for BookingProtection, 97.22% for the guest
normalizer and 100% for the room normalizer. CustomerService is 78.95%, GuestDirectory
86.67% and ApartmentService 81.25%. Frontend generated code is excluded; current
application coverage is 82.00% line/74.82% branch. The retry adapter is 92.13% branch,
session 83.92%, mutation helper 80.55% and versioned-draft helper 66.66%. Sub-90%
critical-module targets remain explicit qualification work; passing required workflows
is not a claim that every failure branch or production environment is verified.

Real Google setup/acceptance remains explicitly deferred in milestone 3. Seasonal
rates, complete calendar/lifecycle, settlement/reporting and deployment/pilot remain
milestones 6-10. Milestone 5 introduces no new role, pricing, refund or hosting policy.
