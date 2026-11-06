# Staff interface

The interface uses React/TypeScript/Vite, React Router 7, TanStack Query 5,
React Hook Form 7 and Zod 4. Exact versions and the npm lockfile are checked in.
Prettier checks the routed app and shared components. Generated API code remains
owned by runtime OpenAPI and the pinned generator.

## Routes and modules

`App.tsx` installs session events and chooses the authentication return or workspace.
`app/Workspace.tsx` owns the session boundary, layout, navigation, query provider and
route focus. Feature pages load as separate chunks under `features/`.

| Route | Implemented behavior |
| --- | --- |
| `/reservations` | Bounded period/status query, URL filters/cursor, empty/error/retry states and record links |
| `/reservations/new` | Guest combobox, strict stay validation, capacity-aware room availability and reconciled creation |
| `/reservations/:id` | Current guest/room/stay, versioned move/date/cancellation confirmation and paged history |
| `/guests` | Private JSON search and validated guest creation |
| `/guests/:id` | Guest contacts, active reservations and a preselected guest link for a new reservation |
| `/rooms` | Current room inventory and capacity; legacy fixture prices are not displayed as real rates |
| `/settings/staff` | Owner invitations, revocation, deactivation and session revocation, with current versions |

Owner settings requires the server-provided `staff:manage` capability. Every supported
staff account is currently an Owner. Unknown routes have a recovery link. Calendar,
Today, rates, reports and financial workflows are not linked before implementation.
Full guest/room CRUD and the later booking/finance workflows remain their planned
milestones; this checkpoint does not replace their policy gates.

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

Web Locks coordinate short updates to the shared booking claim. Each tab also retains
its own unresolved operation in sessionStorage, so another tab's successful confirmation
cannot erase its recovery key. Both stores contain only a SHA-256 identity, random
operation key and optional expected version. They contain no raw guest IDs, dates,
contacts, session cookies or CSRF/provider tokens. The fingerprint includes the canonical
Owner and operation. In-flight promises also include the current login generation.
Reconciliation runs before current availability checks. A retained room selection
remains available to the form after session recovery; after reload, the Owner can
explicitly include unavailable inventory and re-enter the same details to check the
saved result. Server transactions remain authoritative for new writes.
No mutation retries automatically. Browsers need Web Locks over HTTPS or localhost.

Guest creation has no idempotency contract yet. Its unconfirmed-result message directs
the Owner to search saved guests before trying again. Guest creation/search criteria
use JSON; names/contacts are not put in links or query strings. Only surrogate IDs
and non-sensitive period/status/cursor filters appear in direct links.

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
restores focus to the triggering control. Important actions have visible focus and
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
own MariaDB project and two synthetic rooms. It does not read `.env.local`, provision
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
focus and phone record actions. Axe scans desktop, modal and 320-pixel pages. These
are local synthetic-provider checks; real Google and deployment acceptance remain open.

Primary API guidance: [React Router](https://reactrouter.com/start/declarative/routing),
[TanStack query cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation),
[React Hook Form](https://react-hook-form.com/docs/useform), [Zod](https://zod.dev/api).
