# Front-desk daily lists

Owners read `/api/v1/front-desk` for the current Europe/Skopje property day. The
server determines the day, including daylight saving. There is no historical-date
selector or daily reporting calculation in this API.

The list filter selects:

- ARRIVALS: confirmed or checked-in reservations starting today.
- DEPARTURES: confirmed, checked-in or checked-out reservations ending today.
- IN_HOUSE: every physically checked-in stay, including overdue departures.
- ATTENTION: a confirmed stay whose arrival day passed, or a checked-in stay whose
  scheduled departure day passed. Nothing automatically becomes a no-show.

Cancelled and no-show reservations are excluded from those operating lists. Departures
include completed departures so recording checkout will not make the day's record
vanish. Attention links staff to unresolved stays rather than silently changing them.

Each row contains the saved reservation/version, room name/reference and guest name.
It does not return guest contacts, notes, payment totals or staff credentials. Property
scope and current Owner membership apply before reading records. Pagination orders
by reservation ID, accepts an exclusive nonnegative afterId, and limits each page to
1 through 50 entries, default 50. nextCursor means another page is available.

Each response is a separate read-only repeatable-read transaction. The server returns
propertyDate. Supply it as expectedDate when loading another page; a midnight change
returns PROPERTY_DATE_CHANGED so the UI must refresh its first page. Events remain
UTC instants, independent of the JVM and database session timezone.

The responsive front-desk screen links each stay to its reservation details. Those
controls implement [D13 stay operations](reservations.md#stay-operations): explicit
review/confirmation, current room readiness and balance, date/room changes with
accepted whole-stay pricing, and retained historical operation recovery. Completed
stays expose audited time correction rather than ordinary editing. All state changes
invalidate the daily lists, calendar, room readiness, balances and histories.
