# Implementation tracker

The owner approved execution of milestone 1 on November 5, 2026. The plan is a
staff-only application. Google sign-in, EUR, `Europe/Skopje`, and an empty production
start are recorded in [decisions](decisions.md).

## Ten-step plan

| Step | Issue | Dependencies | Implementation state |
| --- | --- | --- | --- |
| 1 | [Modernize the foundation and establish regression checks](https://github.com/skrce/villas/issues/2) | None | Implementing; PRs open, final verification in progress |
| 2 | [Migrate the database and make bookings concurrency-safe](https://github.com/skrce/villas/issues/3) | 1 | Planned |
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
   production restrictions, and pins/verifies the Maven wrapper. Its 48 backend
   tests and frontend lint/build passed locally and in GitHub Actions.
3. The tooling branch adds isolated MariaDB bootstrap/fixtures, four native database
   checks, Vitest interactions, a full browser workflow, generated-contract/client
   drift checks, coverage artifacts, and shared contracts/setup instructions.
   Final local/CI evidence is recorded when this PR is published.

PRs are not merged. Keep the milestone issue open until merge/review acceptance is
recorded. Cloud deployment and real Google verification are later milestone gates,
not part of this milestone's completion claim.

## Repeatable verification

`node scripts/check.mjs` is the full command. It runs the clean backend build and
MariaDB checks, verifies the runtime OpenAPI snapshot, installs frontend dependencies
from the lockfile, regenerates the client, checks drift, runs lint/interaction tests,
builds the frontend, and runs Chromium against its own database and packaged API.
See the README for one-time setup and individual commands.

The audit at `521411b` had 31 backend tests, 87.9% line coverage, 69.4% branch
coverage, and 61.9% reservation-service branch coverage. There were no frontend/browser
tests. Final reports establish a new baseline without claiming full workflow coverage.
Generated frontend code is excluded from coverage; regeneration and real API/browser
interactions check it separately.

Milestone 2 must add adversarial MariaDB tests for overlapping/concurrent bookings,
invalid dates, missing room/guest references, and migration/retry behavior. Milestone 6
must cover rate boundaries, exact cent arithmetic, rounding, and immutable quotes.
Milestones 3 and 8 must cover every permission denial and ledger retry. Target at
least 90% branch coverage for critical booking, authorization, and money modules as
those modules are implemented, with explicit tests for these failure cases. A global
percentage alone is not a release gate.

## Acceptance states

| Evidence | Milestone 1 state | Release gate |
| --- | --- | --- |
| Unit/HTTP/configuration checks | First two PRs pass; combined final run pending | Required for each change |
| Real MariaDB checks | Four local cases pass, including empty production startup | CI required, never silently skip Docker |
| Frontend interactions | Six local cases pass | CI required |
| Browser with real API/database | Added, final local/CI run pending | Extend through later workflows |
| Generated snapshot/client | Updated; final fresh drift check pending | CI required |
| Real Google identity | Not implemented | Milestone 3 |
| Cloud deployment and recovery | Not performed; D04 remains open | Milestone 10 |
| Staff pilot | Not performed | Milestone 10 |

## Known limitations

The frontend remains a single basic console until milestone 4. The schema has no
versioned migrations, reference constraints, booking locks, or strict date model yet.
Legacy cancellation deletes a record. Price integers are fixture values, not the
implemented EUR-cent model. Roles, sessions, rates, a ledger, and a calendar remain
planned. These limitations are not relaxed by the new test setup.
