# Implementation tracker

The owner approved execution through milestone 2 on November 5, 2026. The plan is a
staff-only application. Google sign-in, EUR, `Europe/Skopje`, and an empty production
start are recorded in [decisions](decisions.md).

## Ten-step plan

| Step | Issue | Dependencies | Implementation state |
| --- | --- | --- | --- |
| 1 | [Modernize the foundation and establish regression checks](https://github.com/skrce/villas/issues/2) | None | Implemented and verified; review/merge evidence is in the linked issue |
| 2 | [Migrate the database and make bookings concurrency-safe](https://github.com/skrce/villas/issues/3) | 1 | In progress: schema/date PR merged; transactional inventory and shared queries follow |
| 3 | [Implement secure staff accounts and permissions](https://github.com/skrce/villas/issues/4) | 1, 2 | Planned |
| 4 | [Build the routed staff interface and reusable UI](https://github.com/skrce/villas/issues/5) | 1, 3 | Planned |
| 5 | [Deliver guest and room management](https://github.com/skrce/villas/issues/6) | 2, 3, 4 | Planned |
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

The next PR implements shared apartment locks, expected versions, retained
cancellation, maintenance, operation reconciliation, and atomic events. Native
tests exercise competing writes and injected audit failure. The console integrates
the required keys/versions and preserves pending intents across reloads. Bounded
date-filtered queries, final coverage evidence, and operating checks remain in the
last milestone 2 PR. Google identity and production recovery remain their own gates.

## Acceptance states

| Evidence | Milestone 1 state | Release gate |
| --- | --- | --- |
| Unit/HTTP/configuration checks | All 67 pass in the clean combined run | Required for each change |
| Real MariaDB checks | Five pass, including empty production startup and authentication failures | CI required, never silently skip Docker |
| Frontend interactions | Six local cases pass | CI required |
| Launcher lifecycle | Six checks pass, including signals, real Playwright server cleanup, and cleanup failure recovery | CI required |
| Browser with real API/database | Chromium guest creation, room move, cancellation, and persistence checks pass locally and in CI | Extend through later workflows |
| Generated snapshot/client | Fresh generation and drift checks pass locally and in CI | Required for every API change |
| Real Google identity | Not implemented | Milestone 3 |
| Cloud deployment and recovery | Not performed; D04 remains open | Milestone 10 |
| Staff pilot | Not performed | Milestone 10 |

## Known limitations

The frontend remains a single basic console until milestone 4. The schema has
versioned migrations, reference constraints, and strict calendar dates. Inventory
transactions, version checks, and retry reconciliation are implemented in the
current inventory PR, while bounded queries are still in progress.
Cancellation retains the record and events. Price integers are fixture values, not the
implemented EUR-cent model. Roles, sessions, rates, a ledger, and a calendar remain
planned. These limitations are not relaxed by the new test setup.
