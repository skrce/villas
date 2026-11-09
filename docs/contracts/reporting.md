# Today and reports

Only a current Owner can read Today, reports or CSV downloads. Each service checks
active property membership, and each query keeps the property filter. Responses use
`Cache-Control: no-store`. Protected report data stays in the session's memory cache;
there is no persistent browser cache, export job, public link or background email.
The report is a current corrected view, not an accounting statement or a historical
snapshot of what staff knew on an earlier date.

## Date and room filters

Periods include `startDate` and exclude `endDate`, in Europe/Skopje. A night belongs
to its start day, so a three-night stay contributes three nights even across a DST
change. Periods must span 1 to 366 days. Monetary values are exact integer EUR cents.
All-room reports include archived rooms and their saved records. An optional room
filter must identify a room at this property.

Occupancy and charges select dated room assignments overlapping the period. Balances
select whole bookings with an assignment overlapping that period and room; their
entire current balance is counted once. Collections select effective ledger dates
in the period, regardless of the stay dates. With a room filter, collections include
entries for bookings with any saved assignment to that room. They are booking funds,
not an allocation of receipts between rooms. These distinct date meanings are shown
in the interface and CSV column names.

## Definitions and reconciliation

- Booked occupancy uses saved dated assignments for confirmed, checked-in and
  checked-out stays. Cancellation/no-show contributes no booked nights. Room moves
  retain the previous room's nights. This is booked occupancy, not actual presence.
  Overlapping assignments count a room-night once and produce an explicit conflict
  notice, as does a booked night that overlaps an active maintenance block.
- Capacity uses the **current active room roster** over the whole selected period.
  Gross room nights are active rooms multiplied by period nights. Blocked nights are
  the union of active maintenance dates per active room. Sellable nights are gross
  minus blocked nights. Booked occupancy is active-room booked nights divided by
  sellable nights; zero capacity has no percentage. Archived-room booked nights stay
  visible in source rows but are excluded from both aggregate numerator and capacity.
  Historical room activation and maintenance corrections were not snapshotted. Every
  occupancy report discloses this limitation and must not imply historical capacity.
  Room readiness is operational and never subtracts a sellable night.
- Booked accommodation charges intersect accepted quote lines, report dates and dated
  room assignments. Sum each intersection's nights multiplied by its saved nightly
  cents. Current room rates never reprice a report. The latest accepted whole-stay
  quote applies after a booking change, including retained earlier room nights under
  D12. Cancellation/no-show contributes zero when an accepted price exists. This is
  a booked charge schedule, not collected cash or recognized accounting revenue.
- Corrected collections sum unreversed PAYMENT and REFUND entries by their effective
  property date. Net is collected minus refunded and may be negative for a period.
  Reversed originals and REVERSAL rows remain visible with zero effect, with links.
  Later corrections restate the original effective-date period. A reversal corrects
  a record and is never counted as money returned. Original ledger IDs are strings.
- Current outstanding and credit use the same agreement and complete corrected
  ledger as the booking's payment summary. Accommodation owed is zero for cancelled
  and no-show bookings. Outstanding is max(owed minus net received, 0); credit is
  max(net received minus owed, 0). Completed stays remain included. Payments never
  alter agreed prices. Balance reports are current positions, not period-end balances.

Missing accepted legacy EUR prices remain unknown. Their source rows and count are
visible, known subtotals are named as such, and complete money totals are null.
Legacy integer prices are never converted. A missing/corrupt accepted source causes
an explicit failure. An empty room roster is reported as missing setup, not a fully
selected business with zero activity. Missing current rates are called out on Today;
they do not invalidate a previously saved price or a room-night count.

## Snapshot, limits and downloads

Each read uses one new repeatable-read transaction, including authorization, totals
and every source row. Today returns full SQL counts and at most five linked examples
per queue. Its money attention covers all bookings, including future and completed
stays, and explicitly separates known balances and unknown prices.

GET `/api/v1/reports` accepts `kind` OCCUPANCY, CHARGES, COLLECTIONS or BALANCES,
`startDate`, `endDate` and optional `roomId`. A complete report supports at most 500
rooms, 2,000 selected bookings, 10,000 allocation or maintenance rows and 5,000 ledger
entries. Coverage checks select period-overlapping bookings and validate their full
assignment histories before applying a room filter. Room-filtered collections first
select period entries, then validate their source bookings before room selection.
These booking, allocation and entry bounds apply before room filtering; reduce the
period if exceeded. A room filter can reduce a room-roster or maintenance bound.
Exceeding an applicable bound returns `REPORT_TOO_LARGE`; nothing is silently
truncated. Money aggregates must fit the supported exact-cent range.

GET `/api/v1/reports/export` takes the same filters and the reviewed `snapshotId`.
It recomputes the complete report under the current session. A changed content hash
returns `REPORT_CHANGED` and requires a refresh, rather than downloading numbers that
do not match the screen. Hashes contain no raw identifiers or guest fields. Downloads
are synchronous, at most 5 MiB, and include all rows rather than a visible UI page.
They include a METADATA row even when no source records match, followed by DATA rows.
They use UTF-8 with a BOM, quoted comma-separated cells, CRLF rows, explicit EUR-cent
columns, fixed filenames, attachment disposition, no-store and nosniff headers.
Unknown cells say UNKNOWN. Text beginning with spreadsheet formula markers, including
after leading whitespace/control characters, receives an apostrophe before quoting.
Long digit strings, leading-zero numbers and exponent-like values also receive a
text guard. Import CSV columns as text to retain exact IDs, cents, dates and receipt
formatting; automatic spreadsheet type conversion is not a lossless import contract.
No guest contacts, raw reasons, staff identities, operation keys or credentials are
exported. Source links lead to authenticated booking, ledger or room pages.

Browser refresh/download failures remain visible. A failed refresh marks retained
data as stale and disables downloading. A session change clears protected query data;
an in-flight download must still belong to the same Owner/session before it is saved.

CSV exports include `business_id` metadata and use a business-specific filename.
The [business workspace](business-workspace.md) aborts/ignores pending downloads on
switch or session change; an old export cannot create a file in the new workspace.
