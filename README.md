# Villas

Staff management for Villa Rosa, starting in North Macedonia with EUR and the
`Europe/Skopje` property timezone. The application uses Kotlin/Spring, Java 21,
React/TypeScript/Vite, and MariaDB.

Invited Google accounts establish server-side Owner sessions. The current frontend
has a routed staff workspace with guest/room administration and dated maintenance. Calendar, rates, payments,
and production deployment follow the
[ten-step implementation tracker](docs/implementation.md).

## Requirements

- Linux, macOS, or WSL with Docker integration. Run the scripts inside WSL on Windows;
  native Windows batch execution is not supported by these Node launchers.
- Java from `.java-version`, with `JAVA_HOME` set to that installation.
- Node from `.node-version` and npm 11.6.2. Use `npm install --global npm@11.6.2` if needed.
- Docker Engine or Docker Desktop with Docker Compose v2 running locally.
- Git and the checked-in Maven wrapper. A system Maven installation is unnecessary.

The Maven wrapper verifies its pinned distribution checksum. npm dependencies have
exact direct versions and a checked-in lockfile. CI uses `npm ci`. Client generation
uses the official OpenAPI Generator JAR pinned by version and SHA-256 in
`frontend/openapi-generator.json`; no npm generator wrapper is needed.

## Try the local demo

Google client setup can wait. After installing the requirements:

```sh
./mvnw verify
cd frontend
npm ci
npm run demo
```

Open `http://localhost:5173` and choose **Synthetic Owner**. Use Rooms to add/edit
room metadata and maintenance, Guests to manage optional-contact profiles/history,
and New reservation to select or create a guest inline. This uses a separate private
demo database and loopback identity provider, with a visible demo banner. It never
reads the real Google configuration or calls Google. Ctrl+C stops the owned servers
and database and retains the demo records. See [frontend setup](docs/frontend.md)
for port overrides and the UI/recovery conventions.

## Run locally

Work in a standalone Villas checkout. From its root:

```sh
cp .env.local.example .env.local
```

For real Google sign-in, configure a Villas-specific web client and the initial owner
email privately in `.env.local`. See [Google setup and recovery](docs/security.md).
Register `http://localhost:5173/login/oauth2/code/google`. Google setup and live-provider
acceptance were explicitly deferred by the owner. The automated checks use their own
synthetic provider and private database. Then start an empty database and the API:

```sh
node scripts/dev-db.mjs start
./mvnw --batch-mode verify
node scripts/run-api.mjs --migrate
node scripts/run-api.mjs --bootstrap-owner
node scripts/run-api.mjs
```

The database launcher creates a Compose project and volume specific to the checkout's
absolute path. MariaDB binds to a random port on `127.0.0.1`. Generated local database
credentials stay in ignored `.local-state/` files with owner-only permissions.
The API launcher uses this database and ignores inherited Spring/database overrides.
It binds to `127.0.0.1:9098` and validates the existing schema without changing it.
The explicit `--migrate` command applies packaged Flyway migrations before the API
starts. It starts no web server. See [migration operations](docs/migrations.md).

In another terminal:

```sh
cd frontend
npm ci
npm run dev
```

Open `http://localhost:5173` and choose Google sign-in. An unexpired invitation and
verified matching Google account are required. Villas has no staff passwords or
browser API connection settings. Session/CSRF tokens and protected records are not
persisted in browser storage. Sign-in opens a separate window so expired sessions can
retain entered form details in memory. Review and submit again explicitly afterward.

Rooms can be loaded explicitly for development:

```sh
node scripts/dev-db.mjs fixtures
```

This adds two synthetic rooms only when all three business tables are empty. It
refuses to replace existing records. No guest or booking is seeded. New synthetic
rooms have explicit EUR-cent nightly rates, separate from the retained legacy test
price fields. Existing rooms are never repriced by rerunning fixtures. Owners configure
their rates on the room page, then review and accept a saved price when booking.
Manual price overrides are disabled. Changes to room, dates or party size require
explicit acceptance of a new whole-stay quote at current rates. Prior agreed prices
remain in history. Interrupted saves can be checked without a fresh quote or write.

```sh
node scripts/dev-db.mjs status
node scripts/dev-db.mjs stop
```

Stop the API/frontend with Ctrl+C in their terminals. Stopping the database retains
its volume and credentials. The launcher never prunes Docker resources. Keep
`.local-state/` while retaining the volume, and do not copy it to another checkout.
Use another checkout for a separate empty database. Flyway refuses an existing
unversioned database, including a Milestone 1 bootstrap volume. It does not adopt or
erase its records. Keep that volume and use a fresh checkout for the new empty start,
or plan an explicit adoption separately.

If the default API port is occupied, set `VILLAS_PORT` in `.env.local` and start Vite
with `VILLAS_API_TARGET=http://127.0.0.1:<port> npm run dev -- --port <ui-port>`.
Both servers use strict port binding. They do not stop another process.

## Verify changes

Install the browser once after `npm ci` in `frontend`:

```sh
npx --no-install playwright install chromium
```

On Linux CI, use `playwright install --with-deps chromium` to install system libraries
too. From the repository root, the complete check is:

```sh
node scripts/check.mjs
```

This runs a clean Maven build, unit/HTTP/configuration tests, mandatory MariaDB tests,
Kotlin formatting checks, OpenAPI/client drift checks, frontend lint, interaction
tests, production build, and the Chromium workflows. Commit regenerated contract/client
files before running the drift check. Docker must be available; database tests are
not silently skipped.

The browser check uses a separate randomly named database, generated test credentials,
the packaged API on port 19098, a synthetic OIDC provider on port 19108, and the
production frontend build on port 15073. It exercises real HTTP authorization-code
redirects and signed ID tokens against the private MariaDB database. It
removes its own database volume on completion or SIGINT/SIGTERM interruption. If Docker
cleanup fails, it retains local state for recovery and returns a failure. It refuses
to reuse running servers.

Individual checks are also available:

```sh
./mvnw --batch-mode --no-transfer-progress clean verify
node --test scripts/e2e.test.mjs
node scripts/sync-openapi.mjs
cd frontend
npm ci
npm run generate:api
npm run lint
npm run test:coverage
npm run build
npm run test:e2e
```

Use `./mvnw spotless:apply` to format Kotlin. Reports are in
`target/site/jacoco/`, `target/surefire-reports/`, `target/failsafe-reports/`,
`frontend/coverage/`, and `frontend/playwright-report/`. GitHub Actions publishes
test/coverage artifacts and checks the generated client against the committed files.

## Update the API contract

Backend mappings and annotations own OpenAPI. `ApiContractTest` exports
`target/openapi.json`. To accept an intentional contract change:

```sh
./mvnw --batch-mode --no-transfer-progress verify
node scripts/sync-openapi.mjs --write
cd frontend
npm run generate:api
```

Review and commit `frontend/openapi.json` and the complete generated client. Never
hand-edit generated TypeScript. The canonical base is `/api/v1`. Legacy aliases remain
temporarily compatible. See [API contracts](docs/contracts/api.md).

Local API docs are at `http://127.0.0.1:9098/swagger-ui.html` and `/v3/api-docs`.

## Production status

This checkpoint is not a deployment. Production requires HTTPS, a Villas-specific
Google client and invitation-only sign-in. It rejects synthetic providers and legacy
password settings. API docs are disabled. Cookies are host-only, HttpOnly, SameSite=Lax
and Secure in production, with server-enforced seven-day maximum and three-day idle
limits. Logout and account revocation invalidate access. Real Google setup and live
verification remain open at the owner's request; local OIDC tests do not close them.

A new production database starts empty. Application startup neither creates tables
nor loads demo records. Immutable SQL versions in `src/main/resources/db/migration`
are applied by the explicit migration command using a DDL-capable account. Runtime
credentials should have only application permissions. Production role provisioning
and deployment sequencing remain milestone 10 work.
Do not expose the local launcher publicly. Hosting, Google client registration,
backups, and live-provider verification remain later setup work.

Booking writes now serialize on apartment locks, enforce versions, retain
cancellations, and support operation-key reconciliation. Calendar/history queries
are bounded in the database. The staff workspace accepts guest counts and recovers
pending booking changes across reloads and tabs. Its booking changes require browser
Web Locks over HTTPS or localhost. See the [reservation contract](docs/contracts/reservations.md).
The later staff workflows and live Google acceptance remain separate gates. See [decisions](docs/decisions.md) and
[proposed permissions](docs/contracts/permissions.md).
