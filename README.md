# Villas

Staff management for Villa Rosa, starting in North Macedonia with EUR and the
`Europe/Skopje` property timezone. The application uses Kotlin/Spring, Java 21,
React/TypeScript/Vite, and MariaDB.

Milestone 1 establishes the development and verification setup. The current frontend
is still the basic staff console. The routed interface, calendar, Google staff login,
rates, payments, and production deployment follow the
[ten-step implementation tracker](docs/implementation.md).

## Requirements

- Java from `.java-version`, with `JAVA_HOME` set to that installation.
- Node from `.node-version` and npm 11.6.2. Use `npm install --global npm@11.6.2` if needed.
- Docker Engine or Docker Desktop with Docker Compose v2 running locally.
- Git and the checked-in Maven wrapper. A system Maven installation is unnecessary.

The Maven wrapper verifies its pinned distribution checksum. npm dependencies have
exact direct versions and a checked-in lockfile. CI uses `npm ci`. Client generation
uses the official OpenAPI Generator JAR pinned by version and SHA-256 in
`frontend/openapi-generator.json`; no npm generator wrapper is needed.

## Run locally

Work in a standalone Villas checkout. From its root:

```sh
cp .env.local.example .env.local
```

Replace `VILLAS_LOCAL_PASSWORD` with a unique throwaway local value. Do not use a
personal password. Then start an empty database and the API:

```sh
node scripts/dev-db.mjs start
node scripts/run-api.mjs
```

The database launcher creates a Compose project and volume specific to the checkout's
absolute path. MariaDB binds to a random port on `127.0.0.1`. Generated local database
credentials stay in ignored `.local-state/` files with owner-only permissions.
The API launcher uses this database and ignores inherited Spring/database overrides.
It binds to `127.0.0.1:9098` and validates the existing schema without changing it.

In another terminal:

```sh
cd frontend
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`. In the console's API settings, keep `/api/v1`, enter
the local username and password from `.env.local`, and apply the settings. The
development username defaults to `test`. The console currently stores these local
settings in browser storage. Use synthetic data and a throwaway password.

Rooms can be loaded explicitly for development:

```sh
node scripts/dev-db.mjs fixtures
```

This adds two synthetic rooms only when all three business tables are empty. It
refuses to replace existing records. No guest or booking is seeded. The fixture prices
are legacy test values, not configured production rates. Real room/rate management
arrives in milestones 5 and 6.

```sh
node scripts/dev-db.mjs status
node scripts/dev-db.mjs stop
```

Stop the API/frontend with Ctrl+C in their terminals. Stopping the database retains
its volume and credentials. The launcher never prunes Docker resources. Keep
`.local-state/` while retaining the volume, and do not copy it to another checkout.
Use another checkout for a separate empty database. Schema migrations arrive in
milestone 2. Existing volumes are not upgraded by editing the bootstrap SQL.

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
tests, production build, and the Chromium workflow. Commit regenerated contract/client
files before running the drift check. Docker must be available; database tests are
not silently skipped.

The browser check uses a separate randomly named database, generated test credentials,
the packaged API on port 19098, and the production frontend build on port 15073. It
removes its own database volume on completion. It refuses to reuse running servers.

Individual checks are also available:

```sh
./mvnw --batch-mode --no-transfer-progress clean verify
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

This checkpoint is not a deployment. The default production mode denies business
access and disables API docs until milestone 3 implements invited Google sign-in with
server-side sessions. Development Basic Auth is available only in explicit local/test
modes. Villas will not collect staff passwords in production.

A new production database starts empty. Application startup neither creates tables
nor loads demo records. `src/main/resources/db/schema.sql` is the empty MariaDB
baseline used by local setup/tests, not an incremental production migration runner.
Do not expose the local launcher publicly. Hosting, Google client registration,
backups, and live-provider verification remain later setup work.

Booking concurrency, strict calendar-date validation, and database constraints remain
milestone 2 work. This console is for synthetic local checks until those rules and
staff permissions are complete. See [decisions](docs/decisions.md) and
[proposed permissions](docs/contracts/permissions.md).
