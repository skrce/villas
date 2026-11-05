# API and data contracts

## Current contract

Backend mappings and annotations own the API description. `ApiContractTest` exports
`target/openapi.json`; `scripts/sync-openapi.mjs` normalizes it into the committed
`frontend/openapi.json`. OpenAPI Generator 7.19.0 produces
`frontend/src/api/generated`. CI compares both the snapshot and regenerated client.
The old hand-maintained YAML specification is removed.

The canonical base is `/api/v1`. Operation identifiers are explicit and stable.
Existing request parameters and response shapes are retained during migration,
including scalar IDs on creation and empty successful mutation responses.

| Operation | Canonical request | Temporary legacy alias | Domain owner |
| --- | --- | --- | --- |
| `listApartments` | `GET /api/v1/apartments` | `GET /apartment` | Rooms, milestone 5 |
| `createCustomer` | `POST /api/v1/customers` | `POST /customer` | Guests, milestone 5 |
| `searchCustomer` | `GET /api/v1/customers` | `GET /customer` | Guests, milestone 5 |
| `createReservation` | `POST /api/v1/reservations` | `POST /reservation` | Bookings, milestones 2 and 7 |
| `findAvailableApartments` | `GET /api/v1/reservations/available-apartments` | `GET /reservation/available-apartments` | Availability, milestones 2 and 7 |
| `findReservationsByCustomer` | `GET /api/v1/reservations/customer` | `GET /reservation/customer` | Bookings, milestone 7 |
| `cancelReservation` | `DELETE /api/v1/reservations` | `DELETE /reservation` and `/reservation/` | Cancellation, milestone 7 |
| `updateReservationRoom` | `PATCH /api/v1/reservations` | `PATCH /reservation` and `/reservation/` | Booking moves, milestones 2 and 7 |

The generated contract contains only canonical routes. The frontend uses them.
Legacy aliases remain because callers outside the console have not been inventoried.
Every legacy URL above accepts both forms with and without its trailing slash.
Remove an alias only with its own compatibility review and tests.

Create-customer query parameters are `firstName`, `lastName`, `phone`, and `address`,
all nonblank. Guest search accepts either `firstName` or `phone` and combines both
with AND when both are supplied. Create-booking parameters are `customerId`, `roomId`,
`startDate`, and `endDate`. Cancellation takes `reservationId`; a room change also
takes `newRoomId`. JSON request DTOs and safer guest-data transport belong to the
owning milestone. Avoid query logging in the meantime.

## Errors and access

Handled errors use `{ "code": "...", "message": "..." }`. Do not parse human-readable
messages to make frontend decisions. Current codes are `INVALID_REQUEST` for domain
input failures, `HTTP_<status>` for handled framework failures,
`AUTHENTICATION_REQUIRED`, and `ACCESS_DENIED`.

Current domain failures, including a missing reservation, retain HTTP 400 for
compatibility. Later domain milestones will introduce specific codes and reviewed
404/409 responses. Unexpected server failures are not yet a complete domain error
catalogue. Server configuration suppresses stack traces, binding details, and internal
exception messages in default error responses.

Local/test business requests use temporary Basic Auth. Production denies business
access until milestone 3 implements Google sessions, CSRF protection, and permission
checks. OpenAPI describes the local adapter and makes no claim that Google login is
already available.

## Shared contracts for subsequent milestones

These conventions guide new implementations. They are not capabilities of the legacy
schema/endpoints above.

| Concern | New contract | Implementation owner |
| --- | --- | --- |
| Money | Use EUR and exact integer cents, with a currency field on financial records. Use database BIGINT and checked arithmetic. API values must remain within JavaScript's exact integer range. Formatting divides by 100 for display only. Saved quotes retain the amount and rate inputs. Never calculate money with floating-point arithmetic. | Rates, milestone 6; ledger, milestone 8 |
| Stay dates | Strict ISO `YYYY-MM-DD` calendar dates represented by `LocalDate` and SQL DATE. The interval is `[checkIn, checkOut)`, with check-out after check-in and adjacent stays permitted. Interpret property operations in `Europe/Skopje`, never by browser/server default timezone. | Database/bookings, milestone 2 |
| Event time | Store UTC instants and return ISO 8601 timestamps with an explicit offset, preferably `Z`. Convert for property-local display. | Audit, milestone 3; operations, milestone 8 |
| IDs and ownership | Opaque IDs in the UI, verified references on the server, and a property scope on new staff/business records. A client-supplied ID never grants access. | Database, milestone 2; permissions, milestone 3 |
| Versions | A persisted version changes with each edit. Mutations carry the expected version. A stale edit returns HTTP 409 and `STALE_VERSION`; the UI reloads and asks the user to resolve it. Constraints/transactions still enforce availability. | Database, milestone 2; editing screens, milestones 5 and 7 |
| Idempotency | Booking creation and ledger writes accept `Idempotency-Key`. Persist the property, actor, operation, key, normalized request hash, and result transactionally. The same request returns its recorded result. Reusing a key for different input returns HTTP 409 `IDEMPOTENCY_KEY_REUSED`. Check/retry an unconfirmed write with the same key. Proposed minimum retention is seven days, to be finalized with each workflow. | Bookings, milestone 7; ledger, milestone 8 |

The current API has no idempotency or optimistic-version implementation. Disabling
a pending button reduces duplicate clicks; it does not make retries safe. The frontend
reports unconfirmed network results without claiming the write failed.

## Planned endpoint ownership

Staff/session/invitation endpoints belong to milestone 3. Guest and room CRUD belong
to milestone 5. Rates and immutable quotes belong to milestone 6. Calendar, booking
lifecycle, moves, and availability belong to milestone 7, building on milestone 2's
transactions/constraints. Check-in/out, housekeeping, and the manual payment/refund
ledger belong to milestone 8. Dashboard/report aggregates belong to milestone 9.
Update the generated contract and permission matrix with each domain.

Guest fields, cancellation/refund rules, and rate-override rules are open gates in
[decisions](../decisions.md). Do not silently turn proposals into policy.
