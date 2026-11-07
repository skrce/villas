# Release decisions

Confirmed with the owner on November 5, 2026.

| Decision | State | Contract |
| --- | --- | --- |
| D01: Staff identity | Confirmed | Invited staff use Google OIDC and server-side sessions. No production staff passwords, public signup, or fallback password administrator. Milestone 3 owns implementation and real-provider verification. |
| D02: Region and property settings | Confirmed | Start in North Macedonia. EUR in exact integer cents for new money contracts. Property calendar dates use `Europe/Skopje`, including daylight saving. Audit/event timestamps use UTC. |
| D03: Initial business data | Confirmed | Start production with a new empty database. Staff add real rooms, rates, and bookings through the app. No historical booking import or price conversion is required. Demo fixtures are explicit local/test/staging data only. |
| D04: Hosting | Open | Choose a personal hosting target, domain, secret storage, backups, recovery targets, and monitoring before milestone 10. Local implementation requires no cloud credentials. Retain MariaDB unless a separate decision changes it. |
| D09: Initial staff roles | Confirmed | Owner is the only available role initially. Every invitation grants Owner access. Other roles require a later explicit decision and implementation. |
| D10: Staff session lifetime | Confirmed | Sessions last at most seven days and expire after three days of inactivity. Logout and account/session revocation invalidate access immediately. |
| D11: Initial accommodation pricing | Confirmed on November 6, 2026 | A base EUR nightly price per room with dated seasonal replacements. The price covers any party within capacity. Owners enter the final accommodation price. Villas adds no taxes, fees, discounts or minimum-stay rules. |

The first release serves staff at one property through a responsive online app.
Public booking and guest accounts are outside the ten-step plan. The existing
Kotlin/Spring, Java 21, React/TypeScript/Vite, and MariaDB stack remains in use.

## Business policy gates

The business policies below are confirmed. Hosting and operational recovery targets
remain open under D04 and must be settled before the production milestone.

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
