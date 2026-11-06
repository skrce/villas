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

Room administration, named references, maintenance screens and native conflict checks
are the next implementation PR within milestone 5. Existing room listing and inventory
maintenance retain the [reservation contract](reservations.md) until that PR lands.
