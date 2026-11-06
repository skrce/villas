# Accommodation pricing

The owner approved the initial pricing model on November 6, 2026. Each room has a
base nightly EUR price. Dated seasonal prices replace that base price for their
calendar nights. The room price covers any party within its capacity. The Owner
enters the final accommodation price. Villas adds no taxes, fees, discounts or
minimum-stay rules. The owner confirmed that manual price overrides remain disabled.
Booking-change repricing remains a separate pending owner decision.

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

## Saved quotes and acceptance

`POST /api/v1/booking-quotes` accepts private JSON `{roomId, startDate, endDate,
guestCount, currency}`. Currency defaults to EUR. It saves a UUID quote scoped to
the current Owner and property. Quotes contain the reviewed stay, exact rate
segments/total, rate version, UTC creation time and a 15-minute expiry. They hold
no inventory. `GET /api/v1/booking-quotes/{id}` can retrieve that Owner's historical
quote, including after expiry. Another Owner cannot retrieve or accept it.

`POST /api/v1/reservations/quoted` accepts private JSON `{customerId, quoteId,
roomId, startDate, endDate, guestCount}` and `Idempotency-Key`. Every stay field must
match the saved quote. Client totals, overrides, fees and other unsupported fields
are rejected. Under the Owner, guest and room locks, confirmation rechecks current
membership, guest/room status, capacity, inventory, quote ownership, one-use status,
expiry and rate version. The reservation, accepted price, audit/inventory events and
operation result commit together.

If expiry is reached or the room rate version changes, the attempted booking rolls
back. A separate transaction saves a current replacement quote before returning
`409 QUOTE_CHANGED` with `replacementQuote`. Staff must explicitly review and accept
that new offer. Even a rate edit that leaves the total unchanged requires review.
The failed operation has no committed result. If saving a replacement itself fails,
the response makes no claim that a refreshed offer was persisted.

A quote can be accepted once. Its UUID identifies the immutable reservation-price
snapshot. Reusing it with another operation key returns `409 QUOTE_ALREADY_ACCEPTED`.
Replaying a committed confirmation with its original key and inputs returns the
original result, even after quote expiry, later rate edits or cancellation.

The older POST creation routes accept a `quoteId` and enforce the same rule for
every new booking. A new unquoted request returns `409 QUOTE_REQUIRED`. An existing
unpriced operation can still replay its historical result using its original key
and inputs. No historical price is invented.

`GET /api/v1/reservations/{id}/price` returns `{recorded, price}`. A recorded price
includes its reservation/version, acceptance time and complete saved quote. Historical
unpriced reservations return `{recorded:false, price:null}`. The `/prices` endpoint
returns immutable history ordered by descending reservation version, with exclusive
`beforeVersion` and a maximum page size of 100. All current Owners at the property
may read an accepted reservation price.

The booking screen reviews a saved quote before enabling confirmation. Invalid or
mismatched financial responses cannot enable acceptance. A rate-change response
retains the guest/stay details and asks for another explicit confirmation. A separate
Check previous save action reconciles retained keys without a new quote or write,
including when the room is now unavailable. Browser storage retains only a hashed
intent, operation key, optional reviewed version and opaque quote UUID, never raw
guest, stay or price details.

Existing accepted prices remain unchanged by rate edits and cancellation. Real
date/room/party changes to a priced booking currently return `PRICE_REVIEW_REQUIRED`
until the owner approves the change-pricing policy and that workflow is implemented.
Identical changes remain no-ops. This checkpoint does not complete milestone 6.
Live Google and deployment acceptance remain separately recorded gates.
