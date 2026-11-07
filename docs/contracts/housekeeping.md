# Room readiness

The first release has Owners only. The readiness API does not introduce a
housekeeping role. It returns room state and audit identifiers without guest
contacts, booking prices or payment information.

A new or uninspected room is DIRTY. A missing readiness row reads as DIRTY at
version zero. The first mutation initializes that row under the apartment lock.
Migration initializes existing rooms as DIRTY without changing rooms, reservations,
accepted prices or an already initialized readiness record.

Allowed manual transitions are DIRTY to IN_PROGRESS, IN_PROGRESS to INSPECTION,
INSPECTION to CLEAN, and any of the latter three back to DIRTY. Returning to DIRTY
requires a reason. An unchanged state at its current version is a no-op. Occupied
rooms reject manual readiness changes, including an overdue checked-in guest whose
scheduled dates have ended. Readiness changes never change reservation occupancy.

`GET /api/v1/apartments/{id}/readiness` returns room ID, state, version and the last
UTC change time. `POST` to the same path requires JSON state and expectedVersion,
an optional reason of at most 500 characters, CSRF/Origin and an Idempotency-Key.
Owner membership, room scope/activity, current version and transition validity are
checked in a new READ COMMITTED transaction. The apartment lock serializes readiness
and occupancy decisions. State, event, operational audit and saved operation result
commit or roll back together. Replay returns the original historical result.

`GET /api/v1/apartments/{id}/readiness/events` uses an exclusive decimal-string
afterId and a 1..100 limit. Events retain actor, operation key, before/after states,
version, reason, optional reservation reference and UTC time. They contain no guest
contact or financial fields. Missing/foreign-property rooms return 404.

The storage foundation also adds confirmed, checked-in, checked-out, cancelled and
no-show stay phases with UTC arrival/departure fields. Daily read lists are implemented below. Lifecycle actions, checkout integration
and the mobile cleaning workflow are subsequent Milestone 8 work. Arrival/departure and readiness-override policy remain pending Owner
confirmation. No override is enabled by this foundation.

## Daily room list

`GET /api/v1/housekeeping` returns active room names/references, physical occupancy,
readiness/version/time and active dated maintenance overlapping the next seven property
days. It never joins guest or financial tables. Occupied means an actual CHECKED_IN
stay, even when its scheduled departure is overdue. Missing readiness reads as DIRTY
at version zero without inserting a row. Archived rooms stay in room administration.

The read uses its own repeatable-read transaction for rooms, readiness and maintenance.
An optional exact state filter applies before pagination. `afterId` is an exclusive
nonnegative room cursor and limit is 1 to 50, default 50. A maintenance overflow fails
explicitly instead of showing a partial list. `expectedDate`, when supplied for another
page, must match the current server property date; otherwise PROPERTY_DATE_CHANGED
requires a fresh first page. The response includes propertyDate and maintenanceUntil.
