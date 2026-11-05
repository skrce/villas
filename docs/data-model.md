# Data model

Villas starts with one configured property, `villa-rosa`. Rooms, guests, and bookings
carry a server-owned property ID. Composite foreign keys prevent linking bookings
to another property's guest or room. API IDs retain their existing integer shape.
Property IDs are not client-controlled fields in the console.

| Table | Main fields and invariants |
| --- | --- |
| `apartments` | Positive capacity, optional nonnegative legacy test price integers, active flag, optimistic version, and property scope |
| `customers` | Existing required name/contact fields, optimistic version, and property scope. Guest-field policy D05 remains open for milestone 5. |
| `reservations` | Guest/room references, SQL DATE check-in/out, positive guest count, status/version, UTC creation instant, and property scope |
| `flyway_schema_history` | Ordered migration versions and checksums, managed by Flyway |

Stay dates are `LocalDate` values in the property's `Europe/Skopje` calendar, with
check-in inclusive and check-out exclusive. Check-out must follow check-in. Nights
are calendar-day differences across leap days and daylight-saving transitions.
Inputs must contain exactly `YYYY-MM-DD` within MariaDB's supported 1000-9999 year
range. Timestamp suffixes and impossible dates are rejected.

The first database PR adds status/version fields. Inventory serialization,
maintenance blocks, idempotent operations, cancellation retention, and append-only
events follow in the next PR. An optimistic version alone does not prevent two new
bookings from claiming the same room.

Legacy price integers have no production rate meaning. Exact EUR-cent rate and quote
records belong to milestone 6; no historical conversion is performed. Business
initialization remains empty, and synthetic rooms require an explicit local fixture
command.
