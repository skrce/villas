# Villas development

This is the standalone Villas staff-management repository. Do not apply build tools,
credentials, databases, or deployment assumptions from another project.

## Scope and decisions

Read `docs/maintainer-context.md`, `docs/implementation.md`, the active milestone issue, `docs/decisions.md`, and
the relevant files under `docs/contracts/` before changing a workflow. Keep one
milestone active unless the owner requests otherwise.

The release is staff-only. Production authentication is invitation-only Google OIDC
with server-side sessions. Never add production password login, public signup, or a
fallback administrator password. Synthetic OIDC is allowed only with explicit loopback local/test configuration.

Use EUR integer cents for new money contracts, `Europe/Skopje` for property calendar
dates, and UTC instants for events. Production starts empty. Synthetic fixtures are
explicit local/test data. Do not infer a migration requirement from the old example
data, and do not convert legacy test price integers into real rates.

## Checks and contracts

Use the pinned Java/Node versions, npm 11.6.2, the Maven wrapper, and `npm ci`.
Run `node scripts/check.mjs` from the root for the complete check. It requires Docker
and the Playwright Chromium installation described in the README.
Release changes also require `node scripts/build-release.mjs` and
`node scripts/release-check.mjs` from a clean committed revision. Run the container
rehearsal separately from the regular browser gate because their ports overlap.

Keep meaningful regression tests for changed behavior. Authentication/permissions,
booking conflicts, money calculations, and migrations require tests. Test database
behavior against the pinned MariaDB image, not only H2. Do not skip container tests
when Docker is unavailable or replace provider checks with mocks and call them live.

OpenAPI comes from backend mappings/annotations. Export with Maven verification,
accept changes with `node scripts/sync-openapi.mjs --write`, and regenerate the client
with `npm run generate:api` in `frontend`. Review and commit the snapshot and complete
client together. Do not hand-edit generated files. Preserve compatibility adapters
until every caller has migrated.

Use `./mvnw spotless:apply` for Kotlin formatting. Prefer clear names and short
functions. Comments explain constraints or decisions that code cannot express.
Avoid progress narration in source comments.

## Local state and safety

Use `scripts/dev-db.mjs` for the current checkout's private database. Do not point it
at an external/shared database, copy `.local-state/` between checkouts, prune Docker,
or stop a process owned by another project. The browser runner removes only its own
randomly named database volume. Starting the app never implies deploying it.

Keep guest details, credentials, tokens, and database exports out of git, logs, issue
descriptions, and screenshots. Use synthetic records in tests and review evidence.
Avoid logging query strings that can contain guest data. Database changes that must
apply together belong in one transaction. Migration retries must be safe.

A failed write can have an unknown result. Do not claim a remote write did nothing
unless a definitive response or read-back proves that. Mutation retries need the
idempotency contracts planned in `docs/contracts/api.md`.

## Delivery

Use `codex/` branches and small PRs linked to the active issue. Include behavior,
validation commands/results, and relevant limitations. Update the implementation
tracker, contracts, issue checklist, and setup docs with the code they describe.
Resolve material review findings before merge. Keep local automation, browser tests,
real Google verification, deployed checks, and owner acceptance as separate statuses.
Do not mark an unverified production gate complete because local checks pass.
