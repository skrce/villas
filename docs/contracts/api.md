# API and data contracts

## Current contract

JSON integer fields require integer number tokens. Fractional/exponent numbers and
quoted numbers are rejected instead of being truncated/coerced. Boolean flags also
require JSON booleans. This applies to edit versions, cursors and numeric bodies.

Backend mappings and annotations own the API description. `ApiContractTest` exports
`target/openapi.json`; `scripts/sync-openapi.mjs` normalizes it into the committed
`frontend/openapi.json`. OpenAPI Generator 7.19.0 produces
`frontend/src/api/generated`. CI compares both the snapshot and regenerated client.
The old hand-maintained YAML specification is removed.

The canonical base is `/api/v1`. Operation identifiers are explicit and stable.
Scalar IDs on booking/guest creation and empty successful move/cancel responses are
retained. Canonical inventory writes now require stable operation keys and canonical
edits require expected versions. The generated client and console send both.

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
| `getReservation` | `GET /api/v1/reservations/{reservationId}` | None | Bookings, milestone 2 |
| `changeReservationDates` | `PATCH /api/v1/reservations/{reservationId}/dates` | None | Bookings, milestones 2 and 7 |
| `createMaintenanceBlock` | `POST /api/v1/maintenance-blocks` | None | Maintenance, milestone 2 |
| `cancelMaintenanceBlock` | `DELETE /api/v1/maintenance-blocks/{blockId}` | None | Maintenance, milestone 2 |
| `getOperation` | `GET /api/v1/operations/{operationKey}?kind=...` | None | Write reconciliation, milestone 2 |
| `listReservations` | `GET /api/v1/reservations` | None | Bounded calendar, milestone 2 |
| `listMaintenanceBlocks` | `GET /api/v1/maintenance-blocks` | None | Bounded calendar, milestone 2 |
| `reservationHistory` | `GET /api/v1/reservations/{reservationId}/events` | None | Bounded history, milestone 2 |
| `maintenanceHistory` | `GET /api/v1/maintenance-blocks/{blockId}/events` | None | Bounded history, milestone 2 |

The generated contract contains only canonical routes. The frontend uses them.
Legacy aliases remain because callers outside the console have not been inventoried.
Every legacy URL above accepts both forms with and without its trailing slash.
Remove an alias only with its own compatibility review and tests.

Guest creation uses JSON with required first/last names and optional phone, email,
address and notes. Full guest contracts, combined filters, bounded pages, archival
and duplicate review are documented in [guests and rooms](guests-and-rooms.md).
The compatibility first-name/phone search now applies both supplied filters with AND. Create-booking parameters are `customerId`,
`roomId`, `startDate`, `endDate`, and integral `guestCount` (default 1). Availability
also accepts `guestCount`. All canonical inventory mutations require the
`Idempotency-Key` header. Move/cancel take `reservationId` and `expectedVersion`;
move also takes `newRoomId`. Date/count changes take the path ID, dates, count, and
version. Maintenance creation takes room, dates, and an optional reason (default
`Maintenance`); cancellation takes the path block ID and expected version.
Inventory writes retain their existing parameter contract. Guest write/search bodies
use JSON. Avoid logging request bodies and legacy guest query strings. See [reservation semantics](reservations.md)
for transaction, replay, legacy compatibility, and unknown-outcome behavior.

Calendar queries require a strict `startDate`/`endDate` interval of at most 366 days.
Optional `status` filters active or cancelled records; omitting it includes both.
Calendar/history pages use `limit` (1-200, default 100) and exclusive `afterId` (default
0), returning `{items, nextCursor}`. Follow a non-null cursor with the same filters.
Event IDs/cursors are decimal strings; reservation and maintenance IDs remain INT
numbers. Compatibility guest lists return at most 100 active reservations, ordered
by check-in and ID descending.

## Errors and access

Handled errors use `{ "code": "...", "message": "..." }`. Do not parse human-readable
messages to make frontend decisions. Current codes are `INVALID_REQUEST` for domain
input failures, `HTTP_<status>` for handled framework failures,
`AUTHENTICATION_REQUIRED`, and `ACCESS_DENIED`.

Inventory input errors use HTTP 400, including `INVALID_OPERATION_KEY`,
`INVALID_GUEST_COUNT`, `CAPACITY_EXCEEDED`, `INVALID_VERSION`, and `INVALID_REASON`.
Query bounds use 400 `INVALID_QUERY_WINDOW`, `INVALID_PAGE_SIZE`, or `INVALID_CURSOR`.
Missing property-scoped references use 404 `NOT_FOUND`. A missing committed operation
uses 404 `OPERATION_NOT_COMMITTED`, which is distinct from an unrelated route failure.
Inventory conflicts, stale edits, cancelled resources, and key reuse use 409 with
`INVENTORY_CONFLICT`, `STALE_VERSION`, `RESERVATION_CANCELLED`, and
`IDEMPOTENCY_KEY_REUSED`. `ROOM_INACTIVE`, `RESERVATION_CHANGED`, `DATA_CONFLICT`, and
`INVENTORY_RETRYABLE` are also 409. Retry the last one with the same key after
reconciliation. Unexpected server failures are not yet a complete domain error
catalogue. Default error responses suppress stack traces, binding details, and
internal exception messages.

Business requests require an invited Owner session. Unsafe requests also require
`X-CSRF-TOKEN` and the configured Origin. Read `/api/v1/auth/session` for current
membership, expiry and a memory-only CSRF token. POST `/api/v1/auth/logout` invalidates
the session. Production uses a Secure, HttpOnly, host-only cookie. Synthetic OIDC is
explicitly limited to local/test loopback. Real Google acceptance remains deferred.
Guest creation accepts validated JSON; canonical search uses POST `/customers/search`
with JSON criteria. Old query-based guest writes return 415 and must migrate to JSON.
Legacy read aliases remain protected but are absent from the generated client.

## Shared contracts for subsequent milestones

These conventions guide later domains as well as the implemented booking contract.

| Concern | New contract | Implementation owner |
| --- | --- | --- |
| Money | Use EUR and exact integer cents, with a currency field on financial records. Use database BIGINT and checked arithmetic. API values must remain within JavaScript's exact integer range. Formatting divides by 100 for display only. Saved quotes retain the amount and rate inputs. Never calculate money with floating-point arithmetic. | Rates, milestone 6; ledger, milestone 8 |
| Stay dates | Strict ISO `YYYY-MM-DD` calendar dates represented by `LocalDate` and SQL DATE. The interval is `[checkIn, checkOut)`, with check-out after check-in and adjacent stays permitted. Interpret property operations in `Europe/Skopje`, never by browser/server default timezone. | Database/bookings, milestone 2 |
| Event time | Store UTC instants and return ISO 8601 timestamps with an explicit offset, preferably `Z`. Convert for property-local display. | Audit, milestone 3; operations, milestone 8 |
| IDs and ownership | Opaque IDs in the UI, verified references on the server, and a property scope on new staff/business records. A client-supplied ID never grants access. | Database, milestone 2; permissions, milestone 3 |
| Versions | A persisted version changes with each edit. Mutations carry the expected version. A stale edit returns HTTP 409 and `STALE_VERSION`; the UI reloads and asks the user to resolve it. Constraints/transactions still enforce availability. | Database, milestone 2; editing screens, milestones 5 and 7 |
| Idempotency | Canonical booking/maintenance mutations accept `Idempotency-Key`. Persist property, actor, operation, key, normalized request hash, and result transactionally. Reuse with different input returns 409 `IDEMPOTENCY_KEY_REUSED`. Lookup/retry an unconfirmed write with the same key and prepared version. Successful booking keys currently have no expiry. Future financial retention remains a separate decision. | Inventory, milestone 2; ledger, milestone 8 |

Canonical inventory operations implement versions and persisted idempotency. Legacy
callers that omit these inputs do not get their corresponding guarantees. Guest
creation has no idempotency contract yet. The frontend reports unconfirmed network
results without claiming the write failed.

## Planned endpoint ownership

Staff/session/invitation endpoints belong to milestone 3. Guest and room CRUD belong
to milestone 5. Rates and immutable quotes belong to milestone 6. Calendar, booking
lifecycle, moves, and availability belong to milestone 7, building on milestone 2's
transactions/constraints. Check-in/out, housekeeping, and the manual payment/refund
ledger belong to milestone 8. Dashboard/report aggregates belong to milestone 9.
Update the generated contract and permission matrix with each domain.

Guest fields are confirmed. Cancellation/refund and rate-override rules remain open in
[decisions](../decisions.md). Do not silently turn proposals into policy.

The staff workspace uses generated clients with same-origin sessions and cancellation
signals on queries. Guest search criteria stay in JSON. Browser route links contain
only surrogate IDs or date/status/cursor filters. Versioned confirmation dialogs capture
the displayed version. Booking retry adapters reconcile a saved key before advisory
availability data can block recovery. The server still checks current membership,
versions and inventory transactionally for every new write. See [frontend](../frontend.md).

Room administration adds bounded `/apartments/directory`, property-scoped details,
JSON create/versioned replace/status and private JSON maintenance creation. Optional
`roomId` filters narrow existing reservation/maintenance calendar reads in SQL.
Reference/capacity/archive errors and surrogate conflict links are defined in
[guests and rooms](guests-and-rooms.md). No price fields are accepted by room writes.
