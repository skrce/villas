# Staff interface

The interface uses React/TypeScript/Vite, React Router 7, TanStack Query 5,
React Hook Form 7 and Zod 4. Exact versions and the npm lockfile are checked in.
Prettier checks the routed app and shared components. Generated API code remains
owned by runtime OpenAPI and the pinned generator.

## Routes and modules

`App.tsx` installs session events and chooses the authentication return or workspace.
`app/Workspace.tsx` owns the session boundary, layout, navigation, query provider and
route focus. Feature pages load as separate chunks under `features/`.
Changing a record path or a guest/room/date booking intent remounts the page's local
forms and dialogs. The Owner's draft store stays above that boundary, keyed by its
original record. Room date filters do not change the room's edit identity.

| Route | Implemented behavior |
| --- | --- |
| `/today` | Default landing, complete daily counts, bounded actionable queues, room readiness and current balance attention |
| `/reports` | Defined period/room filters, reconciled source rows, completeness notices and reviewed CSV downloads |
| `/front-desk` | Arrivals, departures, in-house and late/overdue attention lists linked to stay actions |
| `/housekeeping` | Bounded room readiness, cleaning/inspection transitions and maintenance |
| `/calendar` | Weekly room grid, phone agenda, active stays/maintenance, keyboard date selection and seeded booking links |
| `/reservations` | Bounded period/status/room query, URL filters/cursor, empty/error/retry states and record links |
| `/reservations/new` | Guided dates/party, room/guest and exact quote review, full-form option, inline guest creation, retained drafts and reconciled confirmation |
| `/reservations/:id` | Current guest/room/stay, versioned move/date/cancellation confirmation and paged history |
| `/guests` | Bounded private combined search, archived toggle, optional-contact creation and duplicate review |
| `/guests/:id` | Optional contacts/notes, versioned profile edit, archive/restore, complete paginated history and new-stay link |
| `/rooms` | Searchable bounded room directory, unique references, active/archive status and room creation |
| `/rooms/:id` | Editable metadata, versioned archive/restore, bounded dated availability, maintenance create/cancel and retained event history |
| `/rooms/:id#rates` | Exact EUR base/seasonal rate configuration, missing-rate state and reviewed-version editing |
| `/settings/staff` | Owner invitations, revocation, deactivation and session revocation, with current versions |

Owner settings requires the server-provided `staff:manage` capability. Every supported
staff account is currently an Owner. Unknown routes have a recovery link. The calendar,
guest/room management, rate configuration, daily operations, manual settlement and
reporting are implemented. Real Google and production/pilot acceptance remain separate.

## Requests, edits and recovery

Each query/mutation has its own pending/error state. Query functions pass cancellation
signals through the generated client. Keys contain the resource and its filters.
A query client belongs to one login generation. Its provider subtree is keyed by
that generation so observers remount with the new client; the old client is cancelled
and cleared. Protected API records and form drafts have no browser persistence
or service-worker cache. Drafts remain in memory for the same Owner across navigation
and session recovery. Logout/account changes clear them. A fresh login never submits
an old form automatically. Unmounted pages do not redirect after a late write result.

Booking confirmations capture the version the Owner reviewed. A 409 reloads current
records while preserving entered details. A stale confirmation cannot be submitted
again until the Owner closes it, reviews the latest record and opens a new confirmation.
The resulting operation is confirmed before success is reported; current details are
then fetched again because a historical replay is not a claim about current state.

Guest/room editors retain the reviewed version with their entered draft across
reauthentication. A changed/missing version blocks resubmission. Load latest performs
a real protected GET, updates the fields/version only after that explicit action,
and keeps entered details if that read fails. Status confirmations retain their
captured version until closed. Unconfirmed metadata results require read-back; Refresh
details is available. No malformed write response is shown as a confirmed change.

Web Locks coordinate short updates to the shared booking/maintenance claim. Each tab also retains
its own unresolved operation in sessionStorage, so another tab's successful confirmation
cannot erase its recovery key. Both stores contain only a SHA-256 identity, random
operation key, optional expected version and opaque quote UUID. They contain no raw guest IDs, dates, prices,
contacts, session cookies or CSRF/provider tokens. The fingerprint includes the canonical
Owner and operation. In-flight promises also include the current login generation.
Reconciliation runs before current availability checks. A retained room selection
remains available to the form after session recovery; after reload, the Owner can
explicitly include unavailable inventory and re-enter the same details to check the
saved result. Server transactions remain authoritative for new writes.
No mutation retries automatically. Browsers need Web Locks over HTTPS or localhost.

Maintenance creation uses private JSON and the same retained-key reconciliation as
bookings. It does not pre-block recovery based on advisory availability. Confirmation
checks the key/kind/resource, room, dates, reason and maintenance state/version before
clearing the intent. Archived rooms offer an explicit interrupted-save check that
only looks up a retained operation. It cannot create a new block, including after a
definitive uncommitted result; restore the room before making a new maintenance save.
The recovery dialog stays read-only until closed, even if the room is restored while
the dialog is open.
Successful maintenance selects its dated room window, retaining cancelled history.

Guest creation has no idempotency contract yet. Its unconfirmed-result message directs
the Owner to search saved guests before trying again. Guest creation/search criteria
use JSON; names/contacts are not put in links or query strings. Only surrogate IDs
and non-sensitive period/status/cursor filters appear in direct links. Room creation
has a unique reference rather than an operation-key contract; search that reference
before repeating an uncertain create. Shared contacts never merge guests. Same-name
creation requires explicit separate-person review; archived matches link to retained
profiles. New reservation drafts are scoped by a linked guest when present, so a
new guest link cannot accidentally retain another guest choice.
Guest choices show available phone/email and a stable profile number, including when
names and shared contacts match. The selected guest has a separate profile-review link.

## Dates and display

Property dates remain ISO calendar strings, validated for impossible dates and
check-out-after-check-in. Defaults use `Europe/Skopje`. The generated history model
converts ISO dates to UTC Date objects, so the display adapter extracts their UTC
calendar day. Event instants are shown in Skopje time. Tests cover leap days and the
property daylight-saving boundary. Integer-cent EUR formatting uses integer arithmetic,
including the largest safe JavaScript cent value. It does not assign units to legacy
room fixture prices or implement the later rate contract.

## Accessible controls and responsive layout

Shared controls provide explicit labels, linked field errors, status announcements,
a keyboard guest combobox, native date inputs, a modal dialog, confirmations and
request/empty states. Native modal focus containment and Escape are preserved; closing
restores focus to the triggering control or the main content if that control was removed. Important actions have visible focus and
44-pixel targets and require no hover or drag. Tables become labelled record cards on
phones. Navigation and all required actions fit at 320 CSS pixels. Motion preferences
are respected. Desktop and phone evidence is attached to the Playwright report.

## Demo without Google setup

After the normal Java/Docker requirements, run:

```sh
./mvnw verify
cd frontend
npm ci
npm run demo
```

Open `http://localhost:5173` and choose **Synthetic Owner**. This is an explicit local
demo with a loopback identity provider, generated private client configuration, its
own PostgreSQL project and two synthetic rooms. It does not read `.env.local`, provision
the real Owner or call Google. Production rejects the synthetic provider. Ctrl+C stops
only the demo's child process groups and database; its volume/state remain available.
It never stops a process occupying a port. Owned process groups remain tracked if
a launcher exits while descendants survive. Shutdown verifies the groups exit and
escalates within a bounded grace period; an unconfirmed shutdown fails the launcher.

Defaults are UI5173, API19098 and identity provider19108. Optional `VILLAS_DEMO_UI_PORT`,
`VILLAS_DEMO_API_PORT` and `VILLAS_DEMO_IDP_PORT` must be distinct loopback ports. A demo
instance is named `demo-<identity-provider-port>` inside the checkout, keeping different
synthetic issuers in separate databases. For an explicit database-only stop:
`VILLAS_LOCAL_INSTANCE=demo-19108 node scripts/dev-db.mjs stop` from the root. Do not copy
`.local-state/` between checkouts. Real Google setup remains [deferred](security.md).

## Verification

`node scripts/check.mjs` checks the backend, native database, contract generation,
lockfile/audit, formatting, lint, interactions, build, launcher lifecycle and Chromium.
The browser uses its own disposable database/provider and the production frontend
build. It exercises guest creation, booking/date/room/cancellation persistence,
concurrent tabs with a lost response and an explicit retry, owner invitations/session
revocation, reauthentication without a repeated write, direct links, keyboard modal
focus and phone record actions. Axe scans desktop, modal and 320-pixel pages. The milestone 5 browser checks also cover named room/profile editing, real stale-edit
recovery, inline walk-ins, shared-contact/duplicate review, 51-record pagination,
capacity/archive and maintenance conflicts, archive/restore/history, and maintenance
recovery across tabs and reload. These are local synthetic-provider checks; real Google and deployment acceptance remain open.

Primary API guidance: [React Router](https://reactrouter.com/start/declarative/routing),
[TanStack query cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation),
[React Hook Form](https://react-hook-form.com/docs/useform), [Zod](https://zod.dev/api).

Booking room/date/party edits review a whole-stay quote before confirmation. The
original booking version remains in the Owner's memory-only draft across sign-in.
A stale draft requires a protected Load latest stay read before a new review. The
separate Check previous save action reconciles retained keys and historical quotes
without a new quote, write or availability gate. It validates the accepted-price
pointer and complete saved stay/version before clearing recovery state. Accepted
price history uses bounded exclusive version cursors and validates financial data.


## Room calendar

`/calendar?from=YYYY-MM-DD&after=ROOM_ID&archived=true` displays seven property nights
and one complete page of at most 20 rooms. The default includes active rooms only.
Next/first page controls use exclusive room IDs. The backend uses one repeatable-read
snapshot for room metadata, active bookings and maintenance. Cancelled history stays
available through the reservation list/detail rather than occupying calendar nights.

A desktop table exposes each free night as a keyboard button. Select the first and
last night in one room, then follow Create reservation. On narrow screens a room
agenda links available contiguous periods directly to the form. Dates and opaque
room/guest IDs can be deep-linked; guest names/contacts never enter these URLs.
Invalid filters or malformed/incomplete/overlapping responses prevent new selection.
A refresh pauses selection until it succeeds. Error, loading, offline and empty
room states are explicit. Availability is advisory and rechecked atomically at save.

`/reservations` accepts `from`, `to`, `status`, `room` and `after` filters. All filters
participate in the query key and pagination URL. Calendar, list and availability
reads refresh when the window regains focus or reconnects. Protected data remains
inside the session-scoped query cache and Owner memory drafts.


## Guided booking

The default booking form has three steps: dates and party, room and guest, then
quote review and explicit confirmation. Invalid dates/party counts stay on the first
step. Named room cards and a select share one choice. Existing guest lookup and
inline guest creation retain the stay. The final review names the guest and room
alongside dates, party and the exact server price. Step changes move keyboard focus
to their heading. Show all steps exposes the same fields for fast entry and for
re-entering an interrupted request. It does not change validation or save contracts.

A definite inventory conflict returns to room selection, discards that offer and
refreshes alternatives while retaining the guest, dates and party. Unknown outcomes
retain the stable operation/quote and the read-only Check previous save action.
The check never needs a new quote or available room. A confirmation never occurs
because the Owner changed steps, signed in again, refreshed or reconnected.
The booking step/expanded preference stays in Owner memory with its draft; quotes
are deliberately re-reviewed after a recovered session. Every save runs immediately
or reports its failure instead of joining an offline mutation queue. Booking
confirmation/review buttons are disabled while offline, and reconnection alone sends
no write.


A confirmed final save remains completed until its form closes or a new intent is
explicitly opened/reset. This blocks a second click after a fast successful response
but before React finishes navigation. Read-only quote/reload actions and the reusable
invitation form opt into repeatable execution; failures retain deliberate retry and
operation-reconciliation behavior. No time-based debounce is used.

## Color accents

Shared tokens in `index.css` provide a pale blue canvas and table/calendar surfaces,
with mint navigation, selected choices and clean/in-house status chips. Dark green
primary controls remain the main action color. Cleaning uses blue, inspection/dirty
states use amber, and completed stays use a muted blue-gray. Every status retains a
text label; color alone never indicates readiness, occupancy or an error. Keep phone
and desktop contrast/axe checks when adjusting these tokens.

## Today and reports

`/` and `/login` open `/today` after sign-in. Today reads one Owner-only snapshot,
refreshes each minute while visible and on window focus, and shows the property day
and read time. Queue counts cover all matching records; each queue links up to five
examples and its complete front-desk list. Room readiness and tonight's maintenance
remain separate. Money attention covers every booking and labels known outstanding,
known credit and unknown prices explicitly. No business mutation runs from a tile.

`/reports` accepts `kind`, `from`, `to` and optional `room` filters. Forms require an
explicit Apply filters action. The report heading states its applied dates and room,
and every kind explains its date meaning and reconciliation. Read the
[reporting contract](contracts/reporting.md) before changing these definitions.
Occupancy always discloses current-roster capacity; incomplete prices retain unknown
totals and named known subtotals. Records beyond the visible 25 rows can be revealed
without changing the complete totals. Room choices use explicit bounded pages.

Downloads use the reviewed snapshot ID and current session. A server-side source
change requires a fresh report. Failure is visible, retained stale data cannot be
downloaded, and an in-flight result is discarded on unmount or session change.
CSV includes metadata and all source rows, formula/precision text guards, exact EUR
cents and no guest contacts. Import columns as text to preserve their exact format.
Downloads are private files, not persistent browser caches or shareable public links.

The generated export helper has a text response type. Download through
`exportReportRaw().raw.blob()` so the UTF-8 BOM and bytes survive intact. Client
report validation checks phase/agreement rules, ledger effects, accepted quote
references, date quantities, applied room filters and period capacity before totals
can appear or a download can be enabled. Invalid source payloads are explicit errors.

## Shared identity compatibility

The console still uses its configured business until #46/#47. The workspace Owner
key is the membership's `staff.id`, not the canonical identity ID. The new server
session can hold independent business grants, but the console does not select the
first available business or mix business state. Without the configured grant it
hides protected views, shows a workspace-access message and allows sign-out.
A restricted session retains a draft key only for the same canonical identity;
a different identity changes the workspace key and invalidates old continuations.
The [shared-identity contract](contracts/shared-identity.md) records the API boundary;
#47 supplies explicit business URLs, switching and browser namespaces.

API generation uses the pinned CLI plus `openapi-client-config.json` and the project
README template. It exports the pinned API-doc template, supplies stable operation
anchors and removes generic API-key examples that do not apply to HttpOnly cookies.
Every generated local documentation link/anchor is checked before replacing the
client. Fix templates/configuration, regenerate and commit the complete output.
