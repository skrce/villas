# Shared Cloud Run and Neon in Frankfurt

The Owner approved one shared Villas application and PostgreSQL database per
environment. Each accommodation business is a tenant. Staging and production stay
separate, and ABL remains a separate app with its own resources. Use the same
personal Google/Neon accounts as ABL, never employer credentials or ABL secrets/state.

The conversion is in progress under [#44-#49](contracts/multi-tenancy.md). Shared
Google identity and explicitly scoped staff membership management are implemented
in #45. Domain requests and PostgreSQL row security require an authorized business
in #46. Browser switching and shared cloud/recovery qualification remain pending.
Do not deploy this intermediate revision as a shared service.

The earlier per-business Terraform modules remain a locally tested reference until
#48 replaces them. Their live wrapper reads `deploy/cloud/architecture.json` and
fails before cloud authentication while implementation is pending. No environment
variable or CLI override enables it. Local mock-provider checks remain available.
The [archived per-business guide](archive/cloud-run-neon-per-business.md) records the
previous setup and review findings; it is not the current deployment procedure.

## Resource target

| Concern | Shared target per environment |
| --- | --- |
| Web | One Cloud Run service serving the SPA and API |
| Region | Cloud Run `europe-west3`, Neon `aws-eu-central-1` |
| Database | One Neon PostgreSQL 17 database, with business-scoped rows and RLS |
| Identity | One Villas Google web client and callback, with independent business memberships |
| Secrets | Environment-scoped containers and exact numeric versions, payloads outside Terraform |
| Operations | Separate runtime, migration, backup, freshness and scheduler authority |
| Backup | One encrypted all-business repository, seven daily snapshots |
| State | Private personal Terraform state, separated between staging and production |

Retain request billing, scale-to-zero settings, small initial instance/pool limits,
verified TLS and bounded jobs. Measure bursts and database awake time against the
expected fewer than 100 users and 2,000 requests/day. The target does not establish
that a single instance or Free database allowance is sufficient under every pattern.

Business creation must add registry/membership data and a pending first-Owner
invitation through an audited operator workflow. It must not require another cloud
service, database or Google client. Public signup and a platform administrator web
bypass remain disabled. A normal business Owner manages only their own business.

## Local validation

Use the repository's pinned Java, Node and Terraform versions:

```sh
node scripts/install-terraform.mjs /absolute/tools/villas-terraform
VILLAS_TERRAFORM_BINARY=/absolute/tools/villas-terraform/terraform node scripts/check.mjs
node scripts/build-release.mjs
node scripts/release-check.mjs
```

The full gate covers the existing staff workflows and the new native schema tests.
Cloud tests currently validate the legacy modules with mock providers and backend
initialization disabled. They do not prove that shared resources are implemented or
that actual provider IAM/configuration works. The image rehearsal currently uses
the configured-business console. Complete two-business image/restore qualification
is required in #49.

The first migration adds a registry and parent/actor constraints while retaining
existing data and runtime binding. Old migration files and retained MariaDB demo
volumes are preserved. See [the tenancy contract](contracts/multi-tenancy.md) and
[PostgreSQL transition](postgresql-transition.md).

## First setup

Finish #44-#48 and their local checks before provisioning. The selected-host work
then needs actual separate Villas personal staging/production project references,
private operator configuration, Neon projects, the shared Google clients, secret
versions and notification ownership. Google setup remains deferred in #4.

Use separate staging and production databases. Both must start without real guest,
room or booking data. Use synthetic records only in staging. One canonical Google
callback per environment supports every authorized business.

Keep services private and schedules paused during initialization. Apply the schema
with migration credentials; validate it using restricted runtime credentials.
Bootstrap a business and pending Owner invitation through the controlled workflow.
Never create a password account or populate production from a demo volume.

The current private operator examples and per-business Terraform inputs are
superseded. #48 will provide the shared inputs and working procedure. Do not change
`architecture.json` to ready merely to make an old apply succeed.

## Deploying a later change

The existing publication workflow is reusable. It requires a successful exact-master
push Checks run, downloads its verified JAR/frontend artifacts, builds and rehearses
Linux amd64 images, and publishes immutable digest receipts with repository-bound
WIF. The publisher cannot deploy, read app secrets or run SQL. It must not be treated
as a shared release approval while the tenancy implementation is incomplete.

After #48 lands, promote the same tested digests through staging and production.
The shared maintenance procedure must account for every business and all in-flight
jobs. It closes public access, pauses schedules, switches to static maintenance,
fences runtime database access and drains old app revisions before backup and DDL.
Verify the resulting schema, authorized context and isolation before reopening.

Retain prior image receipts and qualified snapshots. On an interrupted write, inspect
remote state before retrying. Do not automatically roll back a database, re-run
bootstrap or reopen access after an uncertain migration result. The publisher and
scheduler must not obtain recovery authority.

This is the required rollout contract. The shared resource configuration and exact
operator commands remain deliverables in #48. The portable
[Compose deployment](deployment.md) still documents the single-business local reference.

## Backups, recovery and signals

Retain daily encrypted backups with 24-hour data-loss and recovery targets and seven
daily snapshots. The actual hosted targets need a timed off-server rehearsal.
Shared dumps must include every tenant despite RLS. Backup credentials/policies must
be explicitly qualified; silently filtered dumps are a failure.

A full restore goes into a new isolated target, reconciles all business/configuration/
financial/audit records, purges old sessions and audits every affected business.
Selective recovery restores a full snapshot in isolation before extracting and
reconciling only the selected business. It must preserve the other businesses and
their financial/audit history. Both paths remain work in #48/#49. The current
single-business quarantine script is not a shared recovery implementation.

Preserve fixed, privacy-safe failure categories and exclude request URL logs. Scope
operational data deliberately; guest names, contacts, reasons, amounts, credentials
and raw database exports do not belong in logs or GitHub evidence. Freshness checks
should inspect durable protected-time metadata without waking the database.

Periodic external liveness remains an availability/cost choice to qualify before
launch. The `/health` handler itself does not query the DB, but a Java cold start
validates its schema and can wake Neon. An idle outage without external checks is
discovered on the next real request. Actual alert delivery remains a release gate.

## Cost and release gates

Target Free initially, with small notification budgets and measured usage. All
businesses in an environment share its Neon quota and failure domain. ABL shares
the personal billing account's provider allowances. Storage, secrets, registry,
transfer or schedules can have small costs even when compute is free. A budget is
a notification, not a spending cap. Recheck provider pricing before provisioning.

The [release checklist](release-checklist.md), #49 and #11 remain open for actual
Google, provider/IAM, alert delivery, off-server recovery, cost/availability and
Owner pilot evidence. Local tests and successful infrastructure plans do not close
those gates. Custom domain remains deferred; provider HTTPS is sufficient initially.
