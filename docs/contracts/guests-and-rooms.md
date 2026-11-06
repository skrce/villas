# Guests and rooms

## Guest records

The owner confirmed D05 on November 6, 2026. First and last names are required.
Phone, email, operational address and notes are optional. Blank optional inputs are
stored as null and displayed as missing. No identity documents or guest account is
required. Names allow 200 characters each, address 500, email 254 and notes 2000.
Names and single-line fields use Unicode NFC, trimmed/collapsed whitespace. Notes
preserve line breaks. Control characters are rejected outside note line breaks/tabs.
Email is trimmed and lowercased. Phone removes spaces, parentheses, dots and hyphens,
converts a leading `00` to `+`, and permits one optional leading plus and 1-20 digits.
No country code is guessed. Supply an international prefix when known; national and
international spellings are not assumed to identify the same person.

`POST /customers` accepts JSON and returns the stable integer ID. Matching normalized
first and last names trigger `409 POSSIBLE_DUPLICATE` unless `allowDuplicate: true`
explicitly confirms a separate person. This is a review aid, not a uniqueness or
identity guarantee. Concurrent creates can still produce matching names. Shared phones
and emails never merge people or make contacts unique. `POST /customers/duplicates`
returns at most 20 current/archived matches by exact normalized full name OR phone OR
email, ordered by ID. Review a matching record or create a distinct guest explicitly.
There is no automatic merge or destructive deletion endpoint.

`POST /customers/query` accepts JSON `{name, phone, includeArchived, afterId, limit}`.
Both criteria apply with AND. Every whitespace-separated name token must occur in the
combined first/last name, case-insensitively; token order does not matter. Phone uses
normalized digit substring matching. Percent, underscore and exclamation mark are
literal search characters. Empty criteria browse the directory. Default excludes
archived guests. Pages use ascending integer IDs, exclusive `afterId` starting at 0,
`limit` 1-100 default 50, and `{items, nextCursor}`. Keep filters unchanged between
pages. Pages observe current state, not a frozen snapshot. All criteria stay out of URLs.
The bounded compatibility `/customers/search` and protected legacy GET aliases retain
list responses and first-name-only name matching, but now combine name and phone with
AND. They exclude archived guests. New screens use the paginated JSON query.

`GET /customers/{id}` includes archived profiles for Owner history views.
`PUT /customers/{id}` replaces the editable profile and requires `expectedVersion`.
Omitted optional contacts clear them. The displayed profile version must be sent;
stale writes return `409 STALE_VERSION` and require a reload/review. Status is changed
separately with `POST /customers/{id}/status` and JSON `{active, expectedVersion}`.
Both fields must be present. Archival rejects current/future active reservations,
defined as an active stay ending after today's Europe/Skopje date. Checkout today
no longer blocks archival. Resolve a conflict by cancelling the booking first.
Restoration makes a retained profile selectable again. Past and cancelled records
remain stored. No guest or reservation is deleted.

`GET /customers/{id}/reservations` returns active and cancelled history by descending
reservation ID with `{items, nextCursor}`, `afterId` starting at 0, `limit` 1-100 and
optional `status`. IDs remain internal links. A guest from another property is 404.

Writes lock the current Owner, then the affected guest. Booking creation/moves/date
changes lock the guest before sorted apartment locks. Archival and booking admission
cannot both commit an active future stay for an archived guest. READ COMMITTED keeps
post-lock checks current. Cancellation remains possible for archived historical guests.
Profile changes and archive/restore record actor/action/surrogate ID/UTC time in
`business_events` atomically. No contact fields are copied into that audit table.

Guest creation has no idempotency key contract. An unconfirmed result requires searching
for the guest before another create; no retry or duplicate confirmation is automatic.
Versioned edits require read-back after an uncertain outcome and explicit review before
another submission. This differs from the durable inventory-operation contract.

## Room administration

New HTTP room records require a name, reference and integral capacity from 1 to 1000.
Names allow 200 characters. References use 1-32 letters/digits/hyphens, start with a
letter/digit, and are trimmed/uppercased. A reference is unique within the property,
including archived rooms. Reuse the retained record or choose a distinct reference.
Orientation/view/bed configuration allow 200 characters, features 1000 and floor 50;
all are optional single-line fields with Unicode NFC and collapsed whitespace. These
are operational attributes. No legacy price is converted or exposed as a configured
EUR rate. New room APIs do not accept price fields.

`GET /apartments/directory` uses name/reference substring search, `includeArchived`,
exclusive ascending `afterId` and `limit` 1-100. Percent/underscore/exclamation are
literal search characters. `GET /apartments/{id}` includes archived details.
Compatibility `GET /apartments` and legacy read aliases retain their list shape.
`POST /apartments` accepts the new metadata JSON. `PUT /apartments/{id}` requires
`{details: <metadata>, expectedVersion}`. Archive/restore uses
`POST /apartments/{id}/status` with explicit `{active, expectedVersion}`. Owner writes
lock the current Owner then the apartment, recheck references/bookings, update the
version and record a surrogate-only business audit event in the same transaction.

Capacity reductions reject active reservations ending after Skopje today when the
new capacity is smaller than their guest count. Archive rejects every such current
or future active reservation. Move/cancel those stays or explicitly reduce their
recorded guest count after staff review, then review the room again. There is no
force override, automatic reassignment or deletion. Past/cancelled history remains.
Conflicts return `CAPACITY_CONFLICT` or `ROOM_HAS_BOOKINGS` with at most 20
`relatedReservationIds` and `moreReservations`. Guest archival also returns these
surrogate links. The HTTP boundary has already verified current Owner membership;
no contacts or another property's identifiers are included in the response.

Room metadata writes use the same READ COMMITTED apartment lock as booking/maintenance
mutations. Competing capacity reduction/archive and booking admission cannot commit
an invalid active stay. Archived rooms are excluded from availability and reject new
bookings and maintenance. Future maintenance already recorded when a room is archived
is retained and applies again after restoration. Restoration rechecks capacity.

`POST /apartments/{id}/maintenance` accepts private JSON `{startDate,endDate,reason}`
and requires `Idempotency-Key`. It delegates to the existing atomic inventory writer;
active bookings or another block on the half-open interval return `INVENTORY_CONFLICT`.
Cancel a block with the existing versioned, idempotent maintenance endpoint. Read its
retained event history with the existing bounded event API. Existing query-parameter
maintenance creation remains compatible; the new UI uses the JSON route. Resolve a
maintenance conflict by changing dates, moving/cancelling a booking or cancelling an
old block after review. No stay is silently invalidated.

Existing bounded reservation/maintenance calendar reads accept optional `roomId`.
A foreign/missing room is 404. Filters/pagination execute in the database and retain
the 366-day window and 1-200 page limits. This provides a dated room availability
context without claiming the complete milestone 7 calendar is implemented.

V9 assigns retained rooms meaningful names from their existing view/orientation and
`ROOM-<id>` references. It preserves bookings, maintenance, versions and legacy prices,
resumes partially committed DDL, and enforces reference uniqueness in MariaDB. Legacy
SQL/constructor defaults support fixtures; the new HTTP API always requires explicit
room metadata. Production still starts empty.

Room creation is protected against duplicate references but has no operation-key
contract. An uncertain create requires searching that reference before repeating.
Versioned metadata edits/status changes require read-back and explicit review after
an unconfirmed result. Maintenance retains durable operation reconciliation.

## Staff interface

The directory/profile pages use the bounded APIs above. Guest creation is available
inline in the reservation form and does not discard the stay details. The combobox
searches full names/phone with a 20-match bound and excludes archived profiles. Room
choices include the unique reference so identical room names/capacities stay distinct.
Profile edits retain their reviewed version across login recovery and never silently
upgrade it. Load latest reads the current profile before adopting its version; a failed
read preserves entered values. Archive/capacity conflicts link the affected bookings.

Room periods are shareable date-only links and limited to 366 days. Maintenance uses
private JSON and durable key recovery before any new POST, including after another
tab's confirmation and a full reload. Cancelled blocks and events remain inspectable.
The current UI supports Owner accounts only; the server rejects housekeeping direct
requests. No rate, finance or production acceptance is implied by these screens.
