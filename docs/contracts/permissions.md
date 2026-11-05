# Proposed staff permissions

This matrix is a proposal for milestone 3, not implemented RBAC. Confirm D09 before
shipping staff accounts. The current console has a single local/test development
user. Default production mode denies business access to everyone.

| Capability | Owner | Front desk | Housekeeping |
| --- | --- | --- | --- |
| Invite, revoke, and assign staff roles | Yes | No | No |
| Configure property, rooms, and rates | Yes | Read operational rooms/rates | Read assigned room/task details |
| View and edit guest contact details | Yes | Yes | No |
| View calendar, create and move bookings | Yes | Yes | No guest booking details |
| Cancel bookings and record check-in/out | Yes | Subject to D06 | No |
| Override a saved rate/quote | With reason and audit | Separate explicit grant, D07 | No |
| Record a manual payment | Yes | Separate explicit grant, D08 | No |
| Record refunds or financial corrections | Yes, subject to D08 | No by default | No |
| View financial reports and exports | Yes | Only an explicitly granted operational view | No |
| View/update cleaning tasks and room status | Yes | Yes | Assigned work only |
| Read audit history | Yes | Own operational actions if needed | No |

Milestone 3 must enforce permissions on the server, test allowed and denied requests,
scope every record lookup to the property, and invalidate revoked sessions. Hiding
buttons is only a usability measure. A staff account must match an invitation using
verified Google identity. Email text from an unverified claim grants no access.
Owner bootstrap requires an explicit configured identity and a documented recovery
procedure, with no password backdoor.

Housekeeping responses must omit guest names/contact data, booking prices, and
payment details. Return only room/task information needed for the job. Audit
permission changes and sensitive writes with surrogate record IDs, not guest details
or tokens.

Google client registration, consent configuration, callback domains, cookie settings,
CSRF/session behavior, and a real Google sign-in/revocation check remain required
milestone 3 evidence. Synthetic authentication tests do not satisfy that gate.
