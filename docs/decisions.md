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

The first release serves staff at one property through a responsive online app.
Public booking and guest accounts are outside the ten-step plan. The existing
Kotlin/Spring, Java 21, React/TypeScript/Vite, and MariaDB stack remains in use.

## Business policy gates

These proposals are not owner-approved policies. Their dependent milestone must
record an explicit decision before shipping the corresponding feature.

| Gate | Current behavior or proposal | Required before |
| --- | --- | --- |
| D05: Guest fields | The legacy API requires nonblank first name, last name, phone, and address. Proposed staff form: require names, allow missing phone/address, and show missing contact information. Confirm the exact required fields before changing validation. | Guest management, milestone 5 |
| D06: Cancellation and refunds | Milestone 2 retains cancelled bookings and events and releases inventory. It initiates no financial action. Confirm deadlines, fees, cancellation permissions, and refund rules before the complete staff workflow. | Booking workflow and settlement, milestones 7 and 8 |
| D07: Rate overrides | Proposed: owners may override a saved quote with an explicit reason and audit entry. Front desk needs a separate permission. Confirm allowed discounts, rounding, taxes/fees, and minimum-stay rules. | Rates and quotes, milestone 6 |
| D08: Manual settlement | Proposed v1 records payments/refunds collected outside Villas. Store no card data and initiate no financial transactions. Confirm permitted methods, refund permissions, reconciliation, and record correction policy. | Front-desk settlement, milestone 8 |

## Development compatibility

Milestone 1 preserves the basic console with Basic Auth only in explicit local/test
modes. The default production mode denies business access and rejects development
authentication properties. This adapter is temporary until D01 is implemented.
Local docs are enabled for contract generation; production docs are disabled.

Milestone 3 is implementing D09/D10 in sequence. The staff-account foundation does
not itself enable HTTP sign-in. Real Google client configuration, the initial owner
email, and live-provider verification remain open until supplied and demonstrated.

The current schema and fixtures preserve legacy integer price fields. They do not
establish a production price unit. Milestone 6 introduces the EUR-cent contract
without converting historical records, consistent with D03.
