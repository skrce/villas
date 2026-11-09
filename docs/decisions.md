# Release decisions

Confirmed with the owner on November 5, 2026.

| Decision | State | Contract |
| --- | --- | --- |
| D01: Staff identity | Confirmed | Invited staff use Google OIDC and server-side sessions. No production staff passwords, public signup, or fallback password administrator. Milestone 3 owns implementation and real-provider verification. |
| D02: Region and property settings | Confirmed | Start in North Macedonia. EUR in exact integer cents for new money contracts. Property calendar dates use `Europe/Skopje`, including daylight saving. Audit/event timestamps use UTC. |
| D03: Initial business data | Confirmed | Start production with a new empty database. Staff add real rooms, rates, and bookings through the app. No historical booking import or price conversion is required. Demo fixtures are explicit local/test/staging data only. |
| D04: Hosting | Revised by the Owner on November 8, 2026 | One shared Villas Cloud Run application in Frankfurt `europe-west3` and one shared Neon PostgreSQL database in `aws-eu-central-1` per environment, targeting Free initially. Staging and production stay separate. Use the same personal Google/Neon accounts as ABL with separate Villas resources and no employer credentials. This supersedes deployment/database per business. Provider HTTPS initially; actual setup, measured cost/availability and live acceptance remain open. |
| D09: Initial staff roles | Confirmed | Owner is the only available role initially. Every invitation grants Owner access. Other roles require a later explicit decision and implementation. |
| D10: Staff session lifetime | Confirmed | Sessions last at most seven days and expire after three days of inactivity. Logout and account/session revocation invalidate access immediately. |
| D11: Initial accommodation pricing | Confirmed on November 6, 2026 | A base EUR nightly price per room with dated seasonal replacements. The price covers any party within capacity. Owners enter the final accommodation price. Villas adds no taxes, fees, discounts or minimum-stay rules. |
| D14: Reporting occupancy | Confirmed on November 7, 2026 | Booked room nights use saved dated assignments, excluding cancellations and no-shows. Disclose that capacity uses the current active room roster because historical room availability was not tracked. Collections and current balances have separate definitions in the reporting contract. |
| D15: Recovery targets | Confirmed on November 7, 2026 | Daily encrypted backups, targeting at most 24 hours of lost data and recovery within 24 hours. The scheduler reserves job runtime within the data-loss window. Retain daily encrypted backups for seven days, confirmed on November 8, 2026. Actual off-server protection and recovery performance require qualification after hosting is chosen. |
| D16: Shared tenancy | Confirmed by the Owner on November 8, 2026 | Each accommodation business is a tenant in the shared app/database. Preserve invitation-only Google login and independent Owner memberships. Implement #44-#49 under milestone 10 before shared launch. Business creation remains controlled; no public signup or platform administrator bypass. Fewer than 100 users and 2,000 total requests/day is the sizing input. |

The first release serves staff through a responsive online app. Each business initially manages one property.
Public booking and guest accounts are outside the ten-step plan. The existing
Kotlin/Spring, Java 21 and React/TypeScript/Vite remain in use. The Owner approved PostgreSQL before first production deployment. Businesses share an app/database within each environment under [the tenancy contract](contracts/multi-tenancy.md). Staging, production and ABL remain separate.

## Business policy gates

The business policies below and D15 recovery targets are confirmed. The hosting architecture is confirmed in D04; actual setup and live acceptance remain open.

| Gate | Current behavior or proposal | Required before |
| --- | --- | --- |
| D05: Guest fields | Confirmed by the owner on November 6, 2026. Require first and last names. Phone, email, operational address and notes are optional. Missing contacts remain visibly missing; never invent contact values or collect identity documents. | Guest management, milestone 5 |
| D06: Cancellation and refunds | Confirmed on November 7, 2026. Cancellation or no-show removes accommodation amount owed while retaining all agreed prices and payment history. Any money held becomes credit until an Owner records a separately completed manual refund. No automatic fee or refund is initiated. | Cancellation-policy extensions and settlement, milestone 8 |
| D07: Rate overrides | Confirmed by the owner on November 6, 2026. Manual price overrides remain disabled initially. Owners configure room rates; the app does not accept a manually replaced quote total. Any later override feature requires a new decision and implementation. | Rates and quotes, milestone 6 |
| D08: Manual settlement | Confirmed on November 7, 2026. Owners record externally completed cash/card/bank-transfer payments, deposits, partial payments and overpayments as visible credits. Refunds cannot exceed remaining money received. Mistakes use linked reversal entries with a required reason. Villas never processes payments or stores card credentials. | Front-desk settlement, milestone 8 |
| D13: Initial stay operations | Confirmed on November 7, 2026. Check-in only within the booked dates and only into a clean room, with no readiness override. Checkout is on the booked departure date; early/late departure requires an accepted date change first. No-show is available after the arrival day. Completed stays require a reasoned, audited Owner correction. | Front-desk lifecycle, milestone 8 |
| D12: Booking-change pricing | Confirmed by the owner on November 6, 2026. Calculate the entire requested stay at current room rates, require explicit acceptance of a new quote, and retain prior agreed prices. Cancellation retains the price and initiates no fee or refund. Unchanged stay details do not reprice the booking. | Room/date/party edits, milestone 6 |

## Development compatibility

Google OIDC and server-side sessions now replace the temporary Basic Auth adapter.
Synthetic OIDC is available only in explicit loopback local/test modes. Production
rejects it and legacy password settings. The initial owner email was supplied
privately. The owner deferred Google client creation and live-provider acceptance;
those gates remain open while the verified local implementation enables milestone 4.

The current schema and fixtures preserve legacy integer price fields. They do not
establish a production price unit. Milestone 6 introduces the EUR-cent contract
without converting historical records, consistent with D03.

The previous per-business hosting choice was implemented as local preparation in
PR #43. D04/D16 supersede that topology before provisioning. PostgreSQL and the
existing staff workflows remain in use; the shared tenancy rollout and current
implementation status are in [the contract](contracts/multi-tenancy.md).
