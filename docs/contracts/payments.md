# Manual payments and refunds

Owners record money already received or returned outside Villas, using cash, an
external card payment or a bank transfer. Villas does not process payments or expose
fields for card credentials. Pending transfers are not received money.

All amounts are positive integer EUR cents at most 9007199254740991. Dates are strict
property calendar dates, from year 1000 through today in Europe/Skopje. A refund
cannot precede its receipt's date. Recorded timestamps are UTC with microseconds.
Ledger IDs and linked IDs are decimal strings, including beyond JavaScript integer
precision. JSON receipt IDs must be strings; numeric and boolean values are rejected
before any allocation. Reservation versions remain supported exact integers.

## Immutable records

A payment creates a receipt. A refund links one unreversed receipt and cannot exceed
its amount less its unreversed refunds. Deposits, partial payments and overpayments
use the same receipt contract. A receipt's payment method and a refund's method record
the actual external channel and may differ.

A correction creates a linked full reversal with a required reason. It does not
return money or change the original entry. Correct a partial mistake by reversing
the mistaken entry and recording the actual fact separately. An entry can be reversed
once. Reversals cannot be reversed. Reverse erroneous linked refund records before
reversing their receipt. A real refund and a bookkeeping correction are separate
Owner actions.

Entries retain their amount, currency, method, booking/version, actor, operation key,
effective date, recorded timestamp, receipt reference, reason and links. No edit or
delete endpoint exists. Business audit, entry, booking version and operation result
commit together. Audit records contain surrogate IDs, not payment notes or guest data.

## Balances

The current accepted quote is the saved accommodation agreement. Previous accepted
prices remain in the existing immutable price history. Payments never change a price.
The summary reads the agreement and the complete ledger in one repeatable-read
transaction. It does not total only the visible history page.

Effective payments and refunds exclude entries with a reversal. Net received is
effective payments minus effective refunds. Each effective aggregate must fit the
supported exact EUR-cent range; unsafe cumulative receipts are rejected.

For confirmed, checked-in and checked-out stays, accommodation owed is the current
agreed total. For cancellation or no-show it is zero. Both retain the agreed price
and every financial record. Outstanding is max(accommodation minus net received, 0).
Credit is max(net received minus accommodation, 0). An Owner records a separately
completed manual refund to return credit. Cancellation creates no fee or refund.

A historical booking without an accepted EUR quote has an explicit unknown agreement
and balance. Financial mutations are disabled for it. Legacy integer prices are never
interpreted as an agreed EUR price.

## API and concurrent updates

- GET `/api/v1/reservations/{id}/ledger` returns the current booking version,
  property date, agreed/accommodation/outstanding/credit amounts and complete fund totals.
- GET `.../ledger/entries` returns newest-first immutable history.
- GET `.../ledger/payments` returns unreversed receipts and their remaining refund allocations.
- POST `.../ledger/payments` records an external receipt.
- POST `.../ledger/refunds` records an external refund against `paymentId` with a reason.
- POST `.../ledger/entries/{entryId}/reversal` corrects a record with a reason.

Both lists default to 50, accept 1 to 100 entries and use an exclusive decimal-string
`beforeId` cursor, with zero starting the first page. A returned `nextCursor` means
another page exists. Fully refunded receipts remain visible with zero refundable funds.

All writes require a current Owner, CSRF/Origin, `Idempotency-Key` and an explicit
reviewed `expectedVersion`. Mutations lock the current Owner and then the reservation.
Each entry advances the reservation version, so a price, stay or financial change
makes another Owner's older confirmation stale. Concurrent refunds cannot exceed the
receipt allocation. Property and booking checks apply to reads and every linked entry.

Reconciliation uses the shared operation endpoint with RECORD_PAYMENT, RECORD_REFUND
or REVERSE_ENTRY. A repeated key/input returns its historical committed result even
after repricing or cancellation. A changed input with the same key conflicts. Missing
or indeterminate responses are not evidence that money was unrecorded. The frontend
workflow and browser recovery checks follow in the next implementation slice.

## Staff interface and recovery

The reservation's Payments section shows accommodation owed, net received,
outstanding funds, credit and paged immutable history. Owners choose an external
method, actual date and optional receipt reference, then review the exact EUR amount
before a separate final confirmation. Refunds select a receipt and require a reason.
Corrections review the entire original amount and a reason. History retains originals
and links to refund/reversal records. Phone layouts use the same controls.

Financial form fields and reviewed versions stay in the same Owner's memory-only
draft across reauthentication. Persistent browser metadata contains only a hashed
operation identity, opaque key and original version. It contains no amounts, methods,
receipt references or reasons. Tabs serialize shared identity changes with Web Locks.

An indeterminate response keeps the key. Check previous save performs only read-back,
including after cancellation or another tab's confirmation. It validates the committed
actor, booking, original version, kind, amount, method, date and links before clearing
matching metadata. It never treats current booking state as the historical result.
A new record after a stale version requires an explicit fresh balance and review.
No payment write is automatically resubmitted after login, reconnect or a failed read.
