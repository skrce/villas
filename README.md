# Villas

Staff management for Villa Rosa. The current foundation keeps Kotlin/Spring, Java 21,
React/TypeScript/Vite, and MariaDB. The initial region is North Macedonia, currency EUR,
and property timezone `Europe/Skopje`.

Milestone 1 is in progress in [issue #2](https://github.com/skrce/villas/issues/2).
The reservation rules, staff Google login, and operational screens have their own
implementation milestones. This checkpoint is for local development.

## Tools and checks

Use the Java and Node versions in `.java-version` and `.node-version`, npm 11.6.2,
and the checked-in Maven wrapper. The wrapper verifies the Maven distribution checksum.

```sh
./mvnw --batch-mode verify
cd frontend
npm ci
npm run lint
npm run build
```

Backend verification includes the original service/repository tests, HTTP regressions,
canonical API export, production configuration tests, and Kotlin formatting. Use
`./mvnw spotless:apply` to format Kotlin changes.

## Local backend

Configure an isolated local MariaDB schema with the application tables, then set:

- `VILLAS_DB_URL`, for example `jdbc:mariadb://127.0.0.1:3306/villarosa`.
- `VILLAS_DB_USERNAME` and `VILLAS_DB_PASSWORD` for that local database.
- `VILLAS_LOCAL_PASSWORD`, a local-only console password.
- Optional `VILLAS_LOCAL_USERNAME`, which defaults to `test`.

```sh
./mvnw spring-boot:run -Dspring-boot.run.profiles=local
```

The API binds to `127.0.0.1:9098` by default. `VILLAS_BIND_ADDRESS` and `VILLAS_PORT`
explicitly override these values. Isolated database/bootstrap tooling follows in
Milestone 1's final PR. The old `database_setup.sql` contains development example data
and is not a production initialization procedure.

## Local frontend

```sh
cd frontend
npm ci
npm run dev
```

Open the Vite URL. The current console uses the development username and
`VILLAS_LOCAL_PASSWORD` from the backend process. The Vite proxy forwards its requests
to the local API.

## API contract

The canonical API uses `/api/v1`. Existing `/apartment`, `/customer`, and `/reservation`
URLs remain compatibility aliases while the frontend migrates. Both reservation
cancellation/room-change forms with and without the trailing slash are supported.

OpenAPI comes from the backend. Local docs are available at
`http://localhost:9098/swagger-ui.html` and `http://localhost:9098/v3/api-docs`.
The contract test writes `target/openapi.json`. Frontend snapshot/client synchronization
is completed in Milestone 1's final PR.

## Production boundary

The default production mode denies business access until the Google staff-login
milestone is implemented. It disables API docs, rejects development-auth settings,
and does not load demo records. Database schema management is separate from application
startup. A new production database starts empty; staff add real rooms and bookings later.

Basic Auth is temporary local/test compatibility for the existing console. It is not
production staff authentication. Hosting and real Google client configuration remain
later setup work.
