# Reservation inventory contract

Stay dates are strict `YYYY-MM-DD` calendar dates in `Europe/Skopje`, represented by
`LocalDate` and SQL DATE. Supported years are 1000-9999. Check-out must follow
check-in. Nights are calendar-day differences, including leap days and DST changes.
An active stay occupies `[startDate, endDate)`. Two intervals overlap exactly when
`existing.startDate < requested.endDate AND existing.endDate > requested.startDate`.
Adjacent stays are allowed. Active maintenance blocks consume the same inventory.

Creation checks the configured property's active guest and room references, a positive
integral guest count, capacity, room active state, and overlapping inventory. Moves
and date/count changes enforce those same room rules. Assigning the current room is
a no-op, including when that room has subsequently been made inactive. It still
requires the current version and an active reservation.

## Transactions and versions

Every inventory mutation uses a new READ COMMITTED transaction. It claims the
operation key, locks the guest for create/move/date changes, then locks apartment rows with `SELECT ... FOR UPDATE`, checks the current
resource and inventory, writes the resource and its event, then records the result.
All of these writes commit or roll back together.

Moves lock both original and destination apartments in ascending ID order. Other
mutations lock the affected apartment before the reservation or block row. A move
that discovers a changed original room fails rather than editing without its lock.
The initial room lookup returns a scalar ID so it cannot cache a stale entity before
the locked read. READ COMMITTED keeps an overlap query from using a snapshot taken
before a competing writer finished. Guest archival uses the same guest row lock and
rejects current/future active bookings. Archived guests reject new booking, move and
date/count changes while cancellation remains possible. Room deactivation and capacity edits must
use this same apartment lock before checking affected reservations.

Canonical edits require `expectedVersion`. A different current version returns
409 `STALE_VERSION`. Real changes increment the version and append one event.
Identical date/count edits, current-room moves, and an already-cancelled resource at
its current version do not increment it or append another event. Optimistic versions
do not replace the apartment locks needed for competing new bookings.

Cancellation retains the reservation, changes its status to `CANCELLED`, and releases
its inventory. A cancelled reservation cannot move or change dates. Cancelling a
maintenance block also retains it. These are storage and inventory semantics. They
do not establish cancellation deadlines, fees, refunds, or staff permissions; those
remain decisions for milestones 3, 7, and 8. Quotes and financial validation arrive
with the accepted pricing contract in milestone 6.

## Idempotency and an unknown write outcome

Canonical mutations require an `Idempotency-Key` containing a UUID. The server
normalizes it to lowercase and scopes it by property, actor, and operation kind.
A SHA-256 fingerprint covers the operation's normalized inputs, including the
expected version. Maintenance reasons are trimmed before fingerprinting.

Replaying the same key and inputs returns the original committed result, even after
the resource changes again. Reusing it with different inputs returns 409
`IDEMPOTENCY_KEY_REUSED`. A rolled-back operation leaves no successful result. A
duplicate claim waits for the first transaction; its saved result is read in a new
transaction after the failed claim rolls back. Successful keys and events currently
have no expiry or purge job.

After a timeout, connection loss, or unreadable successful response:

1. Keep the original key, inputs, and expected version.
2. Read `GET /api/v1/operations/{key}?kind=CREATE|MOVE|CHANGE|CANCEL|BLOCK|UNBLOCK`.
3. A successful lookup returns that operation's historical result. Read the resource
   separately when its current state is needed.
4. A 404 with code `OPERATION_NOT_COMMITTED` means no committed result was visible
   during that lookup. An earlier request may still be in progress. Resubmit with
   the same key and inputs so the unique claim coordinates with it.
5. An unavailable lookup, unrelated 404, or malformed response proves no remote
   state. Preserve the key and reconcile again. A lock retry returns 409
   `INVENTORY_RETRYABLE` and also retains the same intent.

The staff workspace persists pending booking/maintenance keys and prepared versions
across reloads. Web Locks serialize shared storage updates across tabs; a completion
can clear only its own key. Identical submissions share an in-flight request in one
page and a durable key across tabs. The workspace confirms the committed operation
after a successful mutation response as well as before a retry, so an HTML page or
malformed 200 cannot erase recovery state. A browser without Web Locks cannot submit
booking changes; use a supported browser over HTTPS or localhost.
Its storage identity hashes the local API, canonical Owner ID, operation and normalized
input. Storage contains only that hash, the random operation key and a prepared version;
raw booking/guest details and tokens are not persisted. The server binds operations and
events to the verified canonical Owner. A different Owner cannot recover the original
Owner's operation. Session changes invalidate old API continuations and never trigger
an automatic write after reauthentication.

Legacy aliases enforce the same inventory transaction and validation. Callers may
send keys and expected versions, but both remain optional there for compatibility.
Without a caller-preserved key, a lost legacy response cannot be safely reconciled.
Without a version, a legacy edit has no stale-client protection. Migrate callers to
the canonical contract rather than treating these adapters as a release interface.

## Audit and read contracts

Events record property, actor, operation key, action, resource/version, affected room,
previous room for a move, dates, guest count, and a UTC instant. They contain no guest
contact fields. Events are append-only through application workflows and remain in
the same transaction as the change. Runtime database grants and production audit
retention remain deployment work.

Availability is advisory. It filters active rooms by capacity and uses exactly the
same overlap predicate as the writer, but a write always locks and checks again.
`GET /api/v1/reservations/{id}` includes status and version. The compatibility guest
list returns the latest 100 active reservations, ordered by check-in then ID
descending, with the limit applied in SQL.

Calendar reads use `GET /api/v1/reservations` and `GET /api/v1/maintenance-blocks`.
Both require `startDate` and `endDate`, select overlapping half-open intervals, and
optionally filter `status=ACTIVE|CANCELLED`. Without a status filter they include both.
A query may span at most 366 calendar days. This is a query bound, not a maximum-stay
policy. Both accept `limit` (default 100, range 1-200) and exclusive `afterId` (default
0). Results are `{items, nextCursor}` in ascending ID order. When `nextCursor` is not
null, request the next page with that value and the same filters. The database loads
at most `limit + 1` rows; it does not fetch the entire dataset and slice in memory.

History reads use `GET /api/v1/reservations/{id}/events` and
`GET /api/v1/maintenance-blocks/{id}/events` with the same limit and exclusive cursor
convention. A missing or foreign-property subject returns 404. Event IDs and cursors
are decimal strings so BIGINT identifiers cannot lose precision in JavaScript.
Each item contains actor, key, kind, resource version, affected room/dates/count,
and UTC event time. No guest contact fields are returned. All calendar and history
queries are property-scoped. Pages reflect state at each request; they are not a
frozen snapshot across concurrent edits. Refresh a calendar after a successful write.

`InventoryIT` runs the selected MariaDB image and real migrations. It races creates,
moves, extensions, cancellation, and maintenance, checks replay/rollback/property
scope, and rejects each overlap shape while accepting adjacent stays. HTTP tests
exercise keys, versions, and 400/404/409 responses. Browser checks use the packaged
API and a private MariaDB. H2 is useful for fast regressions but is not evidence for
these native locking guarantees.

`InventoryQueriesIT` checks half-open filters, cancellation/history visibility,
pagination, property isolation, limits, and actual Hibernate entity-load counts.
Native rollback tests inject failures after every type of inventory mutation.
Historical replay and suspended outer transactions also have permanent regressions.

The routed interface also captures the reviewed resource version before opening an
edit confirmation. Its per-tab unresolved key survives another tab clearing the shared
claim after confirmation. Both localStorage and sessionStorage contain only hashed
identities and key/version metadata. A replay refreshes current details and does not
claim that the current room/dates still equal the historical result.
