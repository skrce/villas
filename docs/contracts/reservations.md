# Reservation inventory contract

The stay-operation foundation adds a separate `phase`: CONFIRMED, CHECKED_IN,
CHECKED_OUT, CANCELLED or NO_SHOW. The existing ACTIVE/CANCELLED inventory flag
remains compatible. Checked-out stays retain their historical booked nights;
cancelled/no-show stays release inventory. Arrival/departure UTC strings retain
database microsecond precision. Existing scheduled/cancelled records migrate without
inventing actual arrival or departure times. Scheduled-stay compatibility adapters
accept only confirmed bookings. The reasoned operational endpoints below support
in-house changes and protect completed stays from ordinary editing.

Room/guest archive and capacity protection includes physical checked-in occupancy,
even when its scheduled departure has passed. The room-readiness API and migration
contract are in [housekeeping](housekeeping.md). Financial behavior follows
[manual settlement](payments.md).

Stay dates are strict `YYYY-MM-DD` calendar dates in `Europe/Skopje`, represented by
`LocalDate` and SQL DATE. Supported years are 1000-9999. Check-out must follow
check-in. Nights are calendar-day differences, including leap days and DST changes.
An active allocation occupies `[startDate, endDate)`. Two intervals overlap exactly when
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

Moves lock all allocated rooms and the destination in ascending ID order. Other
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
maintenance block also retains it. Under D06 cancellation/no-show removes
accommodation owed, retaining received funds as credit until a separately recorded
manual refund. Saved quote acceptance and retained prices follow the
[pricing contract](pricing.md).

## Stay operations

Owners use reasoned JSON POST endpoints under `/api/v1/reservations/{id}` with
CSRF/Origin, an Idempotency-Key and the reviewed expectedVersion:

- `check-in`: CONFIRMED to CHECKED_IN on a property day within `[startDate,endDate)`.
  The reviewed readinessVersion must still identify a CLEAN room with no physical
  occupant. An accepted EUR agreement, active room, capacity and availability are
  required. There is no readiness override.
- `check-out`: CHECKED_IN to CHECKED_OUT on the booked departure day. An early or
  late departure requires an accepted date change first. Recording departure and
  marking the current room DIRTY commit together. A nonzero or unknown balance
  requires explicit acknowledgeBalance; checkout never creates a financial entry.
- `no-show`: CONFIRMED to NO_SHOW only after the arrival day, with a required reason.
  Nothing automatically changes a booking's status.
- `cancel`: a confirmed booking becomes CANCELLED with a required reason. In-house
  and completed stays reject cancellation. Cancellation creates no refund.
- `move` and `change`: confirmed or in-house bookings require a reason and explicit
  acceptance of a new whole-stay quote for a real change. In-house moves also require
  the destination's reviewed clean readiness version and physical vacancy, and mark
  the old room DIRTY atomically. In-house dates must retain the actual arrival day
  and may not move departure before the current property day.
- `actual-times`: a reasoned Owner correction of actual timestamps for an in-house
  or completed stay. Arrival must fall within booked dates; departure must be on
  the booked departure day, after arrival and not in the future. In-house corrections
  cannot invent a departure. Status, accepted price and room readiness stay intact.

Actual timestamps use strict UTC strings with at most six fractional digits.
`POST /api/v1/property-time/options` resolves a local Europe/Skopje datetime to zero
choices for a daylight-saving gap, one normally, or two explicit offset/UTC choices
for a repeated time. This is an Owner-only read and performs no correction.

The Owner, affected room and reservation locks serialize operations with readiness,
payments and edits. Historical operation results include the immutable inventory
event, actor, original reviewed version, reason, phase and actual timestamps.
Failures roll back prices, allocations, readiness, audit and operation records.

## Dated room allocations

A move during a stay retains nights before today's property date in their original
room and assigns remaining nights to the destination. Repeated moves on one day
consume no duplicate nights. A physical move on departure day adds no new booked
night; a subsequent accepted extension assigns new nights to that current room.
Overdue in-house stays require an accepted departure-date change before moving.

Inventory availability and the calendar use these dated allocations. The calendar
may return several rows with the same reservation ID, each with a unique allocationId
and its allocated room/period. Pricing still quotes the entire requested stay at
current destination rates under D12, with all previous agreements retained.

`GET .../allocations` reads the room names and positive half-open intervals in a
repeatable-read transaction. Pages use decimal-string afterId, limit 1..100 and an
optional expectedVersion. A stale version fails instead of combining allocations
from different edits. V14 backfills one full-stay allocation per existing booking,
preserves existing allocation rows on retry and does not convert legacy prices.

## Idempotency and an unknown write outcome

Canonical mutations require an `Idempotency-Key` containing a UUID. The server
normalizes it to lowercase and scopes it by property, actor, and operation kind.
A SHA-256 fingerprint covers the operation's normalized inputs, including the
expected version and, for priced creation, the saved quote UUID and reviewed stay.
Maintenance reasons are trimmed before fingerprinting.

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
input. Storage contains only that hash, the random operation key, a prepared version and an opaque quote UUID;
raw booking/guest details and tokens are not persisted. The server binds operations and
events to the verified canonical Owner. A different Owner cannot recover the original
Owner's operation. Session changes invalidate old API continuations and never trigger
an automatic write after reauthentication.

Legacy aliases enforce the same inventory transaction and validation. Callers may
send keys and expected versions, but both remain optional there for compatibility.
New bookings on these routes require an accepted quote. Existing unpriced operations
can still replay their original result; new unquoted writes are rejected.
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


## Calendar snapshot

`GET /api/v1/calendar` is Owner-only. Required `startDate`/`endDate` use the existing
strict half-open property-date contract. The window is at most 31 nights;
`afterRoomId` is an exclusive nonnegative Int cursor, `limit` is 1..50 (default 20),
and `includeArchived` defaults false. The response includes explicit `rooms`,
`stays` and `maintenance` arrays plus `nextRoomCursor`. Events are ACTIVE and overlap
the requested window; full event dates are retained when they extend outside it.

All three reads run in one new read-only REPEATABLE_READ transaction, scoped to the
property. A page contains every matching event for its selected rooms. More than
2,000 stays or maintenance blocks fails with `409 CALENDAR_INCOMPLETE`; it never
silently truncates occupancy. Room paging is intentionally one page at a time.
The snapshot carries guest display names and identifiers, without contacts or
addresses. Existing details provide accepted prices and permitted actions.

The calendar is advisory: a displayed free interval is not an inventory hold.
Creation still requires a valid reviewed quote and the existing atomic admission,
operation reconciliation and locking rules. This milestone preserves Owner
cancellation with retained history and no financial side effect under D12. Future
cancellation deadlines, fees and refunds remain separate policy work.

## Staff controls and recovery

Reservation details show the phase, actual arrival/departure, dated room assignments,
accepted prices, funds and immutable history. Each operating action has a separate
review and final confirmation. Checkout displays the balance before acknowledgement.
Ordinary stay/room edits require a reason and explicit new whole-stay quote; an
in-house move also retains the original reviewed destination-readiness version.

Actual-time correction uses a date picker and a separate 24-hour text time so native
browser controls cannot silently discard saved microseconds. Owners resolve property
times and explicitly choose an offset for repeated DST times before reviewing.

Previous-save controls remain available after terminal outcomes. They validate the
original immutable event, actor, operation, version, reason, timestamps and accepted
quote as applicable. Reconciliation reads only and never overwrites current state
with a historical result. Pre-operational booking intents remain recoverable through
the compatibility paths. Same-Owner drafts retain fields/versions across sign-in;
reconnect and reauthentication never submit a write automatically.
