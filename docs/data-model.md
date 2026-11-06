# Data model

Villas starts with one configured property, `villa-rosa`. Rooms, guests, and bookings
carry a server-owned property ID. Composite foreign keys prevent linking bookings
to another property's guest or room. API IDs retain their existing integer shape.
Property IDs are not client-controlled fields in the console.

| Table | Main fields and invariants |
| --- | --- |
| `apartments` | Named room with a property-unique uppercase reference, capacity, orientation/view/bed/features/floor, optional legacy test price integers, active/archive flag, optimistic version, and property scope |
| `customers` | Required first/last names, optional phone/email/address/notes, active/archive flag, optimistic version, and property scope. No uniqueness claim on shared contacts. |
| `reservations` | Guest/room references, SQL DATE check-in/out, positive guest count, status/version, UTC creation instant, and property scope |
| `maintenance_blocks` | Room reference, strict SQL DATE interval, reason, status/version, and property scope |
| `inventory_operations` | Unique property/actor/kind/UUID claim, request hash, original JSON result, and UTC creation instant |
| `inventory_events` | Exactly one reservation or block subject, unique subject/version, operation/actor, room references, dates/count, and UTC event instant |
| `flyway_schema_history` | Ordered migration versions and checksums, managed by Flyway |

Stay dates are `LocalDate` values in the property's `Europe/Skopje` calendar, with
check-in inclusive and check-out exclusive. Check-out must follow check-in. Nights
are calendar-day differences across leap days and daylight-saving transitions.
Inputs must contain exactly `YYYY-MM-DD` within MariaDB's supported 1000-9999 year
range. Timestamp suffixes and impossible dates are rejected.

Apartment locks serialize inventory checks and writes. An optimistic version alone
does not prevent competing creates. Cancelled reservations and maintenance blocks
remain stored but no longer occupy inventory. Events and successful operation results
are retained; no purge job is installed. See the [reservation contract](contracts/reservations.md)
for lock ordering, replay, and the temporary development actor. Date-filtered bounded
read models use database pagination. Indexes support calendar windows, guest lists,
and event cursors without changing the inventory predicate. Event IDs are exposed
as decimal strings so BIGINT values preserve precision in browser clients.

Legacy price integers have no production rate meaning. Exact EUR-cent rate and quote
records belong to milestone 6; no historical conversion is performed. Business
initialization remains empty, and synthetic rooms require an explicit local fixture
command.

Guest changes retain reservations and write surrogate-only business audit events in
the same transaction. Guest archival and inventory creation/edits share a guest row
lock before apartment locks. An archived guest cannot acquire a new or extended
reservation. Current/future active reservations must be resolved before archival.
V8 adds optional guest fields without rewriting existing names or contacts.

V9 backfills room labels/references while retaining old prices and reservations. Room
capacity/status changes share the inventory apartment lock and reject current/future
bookings they would invalidate. Metadata events contain surrogate IDs, not guest
contacts. Availability queries can restrict their bounded database window by room.

V10 adds independent room rate versions, explicit EUR currency and nullable exact-cent
base prices without converting old price fields. `seasonal_rates` stores year-specific
half-open date periods, names and exact nightly cents with property/room foreign keys.
Owner writes serialize on the existing room lock, reject overlaps/stale versions and
commit the complete configuration with its audit event. See [pricing](contracts/pricing.md).
