# Business workspace and browser isolation

[#47](https://github.com/skrce/villas/issues/47) implements the shared staff console
after [shared identity](shared-identity.md) and [database isolation](business-data-isolation.md).
Shared hosting/recovery and release qualification remain #48/#49. Real Google remains
#4. This step provisions nothing and does not qualify a production deployment.

## Choosing and identifying a business

Business pages use `/businesses/{businessId}/...`, including direct links to records,
filters and report views. The selected business comes from that tab's URL. The server
still resolves every API selector against the canonical identity and live membership.
A URL, display name, resource ID or cached membership never grants access.

An authenticated unscoped address shows the caller's business choices, even when
only one membership is available. Opening a business is explicit. No page defaults
to the first membership or deployment compatibility business. Unknown/unauthorized
business URLs show an access message and links to the caller's other valid businesses.

The current business appears in the header, navigation brand, page heading, document
title and footer. A labelled native select appears only with multiple memberships.
It supports keyboard selection and wraps on phones. Returning through that selector
restores the business's last page in the same tab. Native chooser links also support
opening another tab. Switching is local to the tab and sends no cross-tab selection
message or server-side active-business mutation.

Google popup routes remain global. Sign-in refreshes each tab's own URL selection;
logout locks all tabs and invalidates the global session. Refresh may remove grants,
never accept invitations or silently upgrade revoked membership generations. New or
renewed grants require a deliberate Google sign-in. An unavailable business hides
protected views while other memberships remain usable.

## Session and requests

The console validates the canonical identity and complete membership list. Business
IDs and membership IDs must be unique. Each membership supplies its own active Owner
profile and server-derived capabilities. The legacy summary remains an additive API
compatibility field; the console does not use it to select a workspace.

API clients capture the business, membership and session epoch. Every request supplies
exactly that business header and the current CSRF token for unsafe methods. Captured
clients cannot follow a later selection. Changing business, account, login generation
or access invalidates the epoch and aborts the old request controller. Query signals
remain linked to that controller. Response bodies recheck their captured scope after
parsing. Browser history selection runs before router pop-state listeners, and fetch
admission also verifies the current URL.

Transaction-time membership/business rechecks also return scoped 403 denials. A
coordination row hidden by row security rechecks global identity before classifying
the denial; canonical identity failures remain 401. The staff lock order is unchanged.

A business denial immediately removes that grant from the local snapshot and hides
its protected UI while refreshing global metadata. It does not log out other valid
memberships. An unconfirmed global session hides every business until rechecked.

## Queries, drafts and completions

Each active business/member/login epoch owns a new QueryClient. Query hashes include
the canonical identity, business, membership and resource key. Query metadata records
the business, actor and epoch. Leaving cancels and clears that client. A second
business cannot reuse its data, even if numeric record IDs or filters match.

One canonical identity owns separate memory-only draft maps keyed by business and
membership. They survive ordinary navigation, switching and same-identity sign-in,
including re-entry after independent membership revocation. They are unavailable to
an unauthorized workspace. Explicit logout or another identity clears all maps.
A full reload retains no raw fields, names, reasons, money or report records.

Feature components remount by scope/epoch and page identity. Reviewed quotes and
confirmation state must be reviewed again after a switch or sign-in. Saves retain
their original versions/intents; none submit automatically. Mutation completion,
query invalidation, navigation, draft clearing and CSV download guards reject old
scopes. Returning to the same business does not revive a previous epoch's callbacks.

## Interrupted writes and storage

The common operation runner covers booking, maintenance, payment/refund/reversal,
readiness and stay transitions. Stable intent hashes include API, canonical identity,
business, membership, operation kind and reviewed input. In-flight work also includes
the epoch. Persistent values contain only UUID operation/quote IDs and original
versions. Raw inputs are hashed, not stored. Original keys remain usable after a
switch, sign-in or reload; an Owner may need to re-enter the original fields.

Short Web Locks are namespaced by the business/actor scope hash. A separate short
shared lock protects read/modify/write of the common opaque metadata map. No network
operation holds that shared lock. Every asynchronous preparation, lock acquisition
and receipt completion checks its captured scope before changing metadata. An ignored
late receipt cannot erase the interrupted intent or clear another business's draft.

Pre-switcher receipts retain their keys through an alias only when the server's
compatibility summary matches the explicitly selected, authorized membership.
Another business cannot adopt that alias. Copying/clearing aliases occurs under the
same metadata lock and only clear entries that still carry that exact key. There is no fallback business
selection or automatic replay. Read-only reconciliation still precedes new writes
and current availability checks under the existing operation contracts.

## Private reports and frontend delivery

Report requests and snapshot hashes remain scoped by the server. CSV files include
`business_id` metadata on every row and a business-specific filename. A switched,
unmounted, aborted or outdated download cannot create a file. Returning to a business
requires a fresh report and explicit download action. Files remain private exports,
not browser-persisted report caches.

Production serves the same static shell at an explicit allowlist of scoped page
URLs. The shell contains no business data. Scoped API, internal, auth-popup and
private-file paths never fall back to HTML or escape API authorization.

## Verification and remaining operational work

Session tests cover explicit selection, duplicate metadata, per-membership capabilities,
held reads/writes/body parsing, aborts, history, revocation and logout. Interaction tests
check isolated caches/drafts, ignored mutation callbacks, renewed access and global
logout. Operation tests check scoped locks, independent keys, ignored receipt retention
and legacy key adoption. Native tests verify capabilities, scoped shell routes and
business-labelled CSV. Two-business Chromium cases cover independent tabs, request
headers, keyboard/phone accessibility, delayed reads/writes/downloads, reload recovery
and independent membership revocation/sign-in.

The packaged rehearsal uses both real synthetic memberships. Its existing portable
quarantine deletes global JDBC sessions and advances/audits the configured compatibility
business only. It checks stale-cookie rejection and fresh access in both businesses;
all-business generation fencing/auditing and selective recovery remain #48. Keep the
live deployment block until that shared recovery and the remaining release gates pass.
Exact-head checks, independent review and merge evidence belong in #47 and its PR.
