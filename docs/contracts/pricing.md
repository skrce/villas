# Accommodation pricing

The owner approved the initial pricing model on November 6, 2026. Each room has a
base nightly EUR price. Dated seasonal prices replace that base price for their
calendar nights. The room price covers any party within its capacity. The Owner
enters the final accommodation price. Villas adds no taxes, fees, discounts or
minimum-stay rules. Manual overrides and booking-change repricing remain separate
pending owner decisions.

## Money and periods

New money uses exact integer euro cents in BIGINT fields. API amounts must remain
between 1 and 9,007,199,254,740,991 cents. Arithmetic checks overflow and the exact
JavaScript integer limit before returning a total. Unsupported currencies, fractional
or quoted cent values, zero/negative nightly prices and unconfigured rates are rejected.
No existing `regular_price` or `top_season_price` value is converted into a rate.

Rate periods use strict ISO dates in the Europe/Skopje property calendar. Check-in
is inclusive and checkout exclusive. Adjacent seasonal periods are allowed, while
nested, duplicate and partial overlaps are rejected. A season may span New Year.
Its year-specific dates do not recur automatically. A room supports at most 200
seasonal periods in one reviewed configuration. This bounds the configuration request,
not the number of nights in a stay.

The calculation divides a stay at seasonal boundaries. Each line gives its date
range, nightly price, number of calendar nights, rate label and exact subtotal.
All lines cover the requested stay once, with no gaps or repeated nights. Totals
sum those integer subtotals. Leap days and daylight-saving transitions do not change
the definition of a calendar night. Long stays produce bounded rate segments rather
than one response row for every night.

## Room rates

`GET /api/v1/apartments/{id}/rates` returns room ID, currency, nullable
`baseNightlyCents`, rate version and ordered seasons. A null base is an explicit
configuration requirement, never a free stay.

`PUT /api/v1/apartments/{id}/rates` replaces the complete rate configuration using
JSON `{expectedVersion, currency, baseNightlyCents, seasons}`. Each season contains
`{name, startDate, endDate, nightlyCents}`. Names are single-line Unicode text of at
most 100 characters. The initial unconfigured version is zero. Every successful
replacement increments the rate version, including the first save. Editing room
metadata does not change the rate version. Rate edits also increment the room's
metadata version so an already-open room editor cannot overwrite newer row state.

Writes lock the current Owner, then the property's room row, using READ COMMITTED.
They validate the reviewed rate version and replace seasons, base price and audit
event in one transaction. Competing writes cannot overwrite the same reviewed version
or introduce overlapping seasons. Archival retains configured rates. New rate previews
require an active room and a party within capacity.

`POST /api/v1/apartments/{id}/rates/preview` accepts private JSON
`{startDate, endDate, guestCount}` and returns the accommodation breakdown and rate
version. It reserves no inventory and is not an accepted or saved quote. Owner
membership, property scope and room capacity/status are checked on the server.
Missing rates return `409 RATES_REQUIRED`. Overlap returns `409 SEASON_OVERLAP` and
a stale rate edit returns `409 STALE_VERSION`.

V10 adds nullable base prices and independent rate versions/currency, plus seasonal
rows with room/property references, supported amounts and valid-date constraints.
It preserves old prices, guests, bookings, operations and history, resumes partially
committed DDL and creates no production business records.

Quote identity, expiry, explicit acceptance, immutable reservation prices and the
corresponding staff screens are the remaining milestone 6 work. Live Google and
deployment acceptance remain their separately recorded gates.
