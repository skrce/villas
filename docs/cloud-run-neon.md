# Cloud Run and Neon in Frankfurt

This is the selected hosting implementation for D04. It is prepared locally; no
Villas cloud project, live database, OAuth client or operational destination is
claimed to exist. [The release checklist](release-checklist.md) remains the launch
gate. Use the same personal Google/Neon accounts as ABL, with separate Villas
resources, credentials, state and evidence. Never use employer ADC or ABL secret
files, Terraform state, databases, OAuth clients or service accounts.

## Resource layout

Use one new Villas GCP staging project and one new Villas production project.
The staging project owns the Frankfurt Artifact Registry; production's Cloud Run
service agent receives read access to that repository. Both environments deploy
the same published digests. Each business has its own Cloud Run service, Google
client, secret containers, application/operations identities and encrypted backup
bucket. Each business/environment also has a separate **Neon project**, PostgreSQL
17 database named `villarosa`, endpoint and three restricted database roles. A
shared Neon project with different schemas is not this isolation model.

Cloud Run is fixed to `europe-west3`; Neon is `aws-eu-central-1`. The same region name
does not mean a private cross-cloud network: TLS and Neon transfer quotas still
apply. Configure a **direct endpoint**, without `-pooler`, verified server/hostname
TLS, and separate credentials. The app refuses other cloud connection settings.
Runtime cannot migrate; backup cannot write business records. Initial production
is empty, as described in [the PostgreSQL transition](postgresql-transition.md).

The web process serves the SPA and API at port 8080. Cloud Run terminates HTTPS;
canonical redirects, secure cookies, CSRF and HSTS do not trust caller forwarding
headers. Only `/health` is public liveness. Cloud mode denies `/internal/**`,
including readiness and metrics, even for Owners. `check-schema` is an offline
runtime-role job that validates every bundled migration and the business binding.
Request URL logs are excluded before any public verification because OAuth codes
and guest searches can appear there. Fixed application failure categories remain.

The service uses request billing, one CPU, 1 GiB, concurrency two, no startup CPU
boost, minimum zero and maximum one instance at both service and revision levels.
There is no VM, Cloud SQL, load balancer, connector or NAT. The pool has minimum
zero, maximum five and no keepalive. Today stops its minute refresh after three
idle minutes or when hidden; deliberate interaction/focus resumes it. A continuously
used app can still exhaust Neon Free compute. Measure a real working week.

## Local validation

Install the pinned Terraform binary and run the complete repository check:

```sh
node scripts/install-terraform.mjs /absolute/tools/villas-terraform
VILLAS_TERRAFORM_BINARY=/absolute/tools/villas-terraform/terraform node scripts/check.mjs
node scripts/build-release.mjs
node scripts/release-check.mjs
```

Terraform validation uses the locked Google provider and **mock providers**, with
backend initialization disabled. It does not create resources, authenticate a
personal account or prove provider acceptance. The `cloud-preparation` CI job
runs these checks without cloud credentials. A release rehearsal also verifies the
static maintenance response. Its receipt binds the exact source/artifacts/images
and is written only after successful owned-resource cleanup.

## First setup

1. Create the two separate `villas-*` personal GCP projects, attach only the personal
   billing account, and create a private Frankfurt state bucket per project with
   uniform access, public access prevention and object versioning. Keep application
   identities and the GitHub publisher out of state buckets. Select the existing
   personal Neon account and create separate Free Frankfurt PostgreSQL 17 projects
   for each business/environment. Do not upgrade plans automatically.
2. Create a private gcloud directory and the named `villas-personal` configuration.
   Authenticate the approved personal Gmail account there. Every operator gcloud
   command below must explicitly select that directory, configuration, account and
   Villas project. Do not run `gcloud auth application-default login` or rely on the
   global default project. Copy [the operator example](../deploy/cloud/operator.example.json)
   outside git, fill in real references and use mode 0600. Copy
   [the environment example](../deploy/cloud/environment.example.json) to a separate
   private `*.tfvars.json`; it contains references, never secret payloads or tokens.
3. Start with `businesses: {}`. In staging set `registry_project_id` to that same
   project; production references staging's registry. Run the wrapper's `init`,
   `plan`, inspect the complete plan, then `apply`. The wrapper pins the personal
   identity and tools, supplies a short-lived token to provider/backend, scrubs
   ambient cloud credentials and separates staging/production data directories.
   Backend metadata/plans are private operator state; do not upload them.
4. Protect the GitHub `release` environment to master, with an Owner approval rule
   if available for this repository's plan. Set its nonsecret variables
   `VILLAS_REGISTRY_PROJECT`, `VILLAS_WIF_PROVIDER` and
   `VILLAS_PUBLISHER_ACCOUNT` from Terraform outputs. WIF pins the numeric GitHub
   repository/owner IDs, master ref, dispatch event, release workflow and environment.
   The publisher can only push/read this registry. It cannot read application
   secrets, change services, run migrations or restore data.
5. Publish a successful exact-master-push Checks revision using the dispatch
   procedure below. Add the business with `phase: "secrets"`, the published digests,
   direct Neon host and its deterministic service origin. Service names are short
   enough for `https://SERVICE-PROJECT_NUMBER.europe-west3.run.app`.
   This [documented Cloud Run URL](https://docs.cloud.google.com/run/docs/triggering/https-request#deterministic-url)
   is checked against the business and GCP project, rather than accepted as another
   business's callback. Plan/apply creates only identities, secret containers and
   the isolated backup repository infrastructure for that business.
6. In the **new isolated** Neon database, run
   [neon-roles.sql](../deploy/cloud/neon-roles.sql) as its private administrator over
   verified TLS. Use SQL-created roles, not Neon console-created admin roles. Set
   each password interactively with psql `\password`; do not put passwords in SQL,
   shell arguments or GitHub. The script rejects administrative role memberships
   and is repeatable. Verify these privileges against actual Neon before acceptance.
   Create a Villas Google web client for this business/environment with callback
   `PUBLIC_ORIGIN/login/oauth2/code/google`, and the invited Owner as a test user.
7. Add secret versions directly from private files through explicitly scoped
   `gcloud secrets versions add SECRET_ID --data-file=/absolute/private/file`.
   The seven values are runtime/migration/backup DB passwords, Google client ID,
   Google client secret, archive password and initial Owner email. Terraform owns
   containers/IAM only; **secret payloads are never Terraform inputs**. Record exact
   numeric versions. Preserve the archive password in an independent private
   recovery location; losing the cloud account must not lose the only key.
8. Set `phase: "jobs"`; plan/apply. Execute `migrate` and inspect its completed
   execution, then `schema`, then `owner`. Migration reapplies the bundled restricted
   runtime grants after Flyway. It does not start the web process. Jobs have one task,
   bounded duration, zero automatic retries and separate credentials. On a timeout,
   inspect the actual execution and database history before retrying. Run `init`
   exactly once for the encrypted archive, then `backup`, `age` and `verify`.
   Reconcile an isolated off-server restore before treating protection as qualified.
9. Set `phase: "service"`; plan/apply while `public_access`, `schedules_enabled` and
   `launch_qualified` remain false. Use explicit personal IAM invocation for the
   shell/liveness/private access checks. Configure and verify real notification
   channels and the personal budget. A short staging-only `verification_window`
   may explicitly open public invocation to test real Google, cookies, CSRF and
   staff workflows; backup schedules remain paused in that window. Google callbacks
   require this reachable canonical origin. Close the window if verification stops.
   Production cannot use that exception.
10. Complete [the release checklist](release-checklist.md), delivered-alert tests,
    timed restore and staging staff pilot. Record source/digests and private operator
    evidence references in #11/#4, without credentials or guest data. Only then set
    `launch_qualified: true` and enable the intended public service/schedules.
    Qualify empty production separately. A completed Terraform apply is not acceptance.

The operator wrapper takes a private configuration path and one command:

```sh
node scripts/cloud-terraform.mjs /absolute/private/staging-operator.json init
node scripts/cloud-terraform.mjs /absolute/private/staging-operator.json plan
node scripts/cloud-terraform.mjs /absolute/private/staging-operator.json apply
node scripts/cloud-terraform.mjs /absolute/private/staging-operator.json output
```

Apply consumes the saved plan, not newly edited variables. Re-plan after any change.
Use a single operator per environment. Do not copy state between projects or run the
live wrapper for unit validation. Never edit another application's credentials.

## Deploying a later change

Merge only after independent review and exact-head Checks pass. Wait for the merged
master push's successful Checks run, then dispatch **Publish verified release** on
that exact master revision with its run ID. The workflow rejects PR runs, forks,
other workflows, other revisions and failed/incomplete runs. It downloads that
run's JAR/frontend artifacts, builds Linux amd64 images, rehearses those images,
then obtains short-lived WIF credentials and publishes immutable unique tags.
The `verified-release-*` artifact contains `publication.json`: source, input hashes,
Checks reference and app/proxy/backup **registry digests**. Registry publication
does not deploy or run SQL. Protect the release environment before enabling it.

Promote those same three digests through staging and production. Do not rebuild
production. Keep the previous receipt and a qualified pre-change snapshot. For
each business/environment, carry out this maintenance sequence with explicit
personal project/account selectors:

1. Set `public_access: false`, `schedules_enabled: false`, `maintenance: true`, keep
   the previous app/backup images initially, and plan/apply. The service now runs the
   static proxy maintenance image with **no DB/Google settings or secret mounts**.
   Verify its ready revision/image, 100% traffic to it, no old traffic tags, and
   absence of inherited/project-level public invoker grants. Wait for the previous
   60-second request bound plus shutdown margin. Inspect/finish any in-flight jobs.
2. Run [pause-writes.sql](../deploy/cloud/pause-writes.sql) against this direct Neon
   database as its private administrator, with psql `--set=business_id=BUSINESS_ID`.
   It checks the database business binding, disables runtime logins, terminates
   remaining runtime connections and reports their remaining count. Require zero.
   Delete the drained **old application revisions**, after proving they have no
   traffic/tags; wait for deletion. Retain the static revision, images and receipts.
   This removes old background session workers as well as external writes.
3. Run the current `backup` job and confirm a new completed snapshot. With other
   repository writers stopped, run `verify` and the required pre-change restore
   check. Keep schedules paused. Update app/backup job digests from the new receipt,
   while maintenance stays true; inspect the plan and apply. Execute `migrate`
   with `gcloud run jobs execute JOB --region=europe-west3 --wait`, and read back
   the execution result/history if the call is interrupted. Never run schema DDL
   while an old application revision is still able to write.
4. After successful migration, run
   [resume-writes.sql](../deploy/cloud/resume-writes.sql) with the checked business
   ID, then the new `schema` job using restricted runtime credentials. Set
   `maintenance: false` while public access/schedules stay false; plan/apply.
   Verify the ready revision digest, binding/schema check, private health and
   protected access. Complete staging acceptance before repeating in production.
5. Reopen only the intended service and backup schedules. Verify real Google and
   staff smoke checks, `/internal/**` denial, receipt/image consistency and a
   fresh protected backup. Update the release record. Do not repeat `owner` on
   routine deployments. Keep all mutation retries subject to remote read-back.

This is an operator-driven rollout; the GitHub publisher deliberately has no
deployment or recovery authority. API controls must be verified after every live
IAM change. On failure remain private/in maintenance and investigate the observed
state. PostgreSQL transactional DDL does not make application rollback universally
safe: use a compatible prior image, a forward fix, or isolated restore/reconciliation
according to [migrations](migrations.md) and [recovery](recovery.md). Never automatically
roll back a database or reopen writes after a failed job.

## Backups, recovery and signals

Cloud backups stream a compressed custom pg_dump into restic encryption and a
per-business Frankfurt GCS bucket. The attached metadata identity supplies GCS
access; ambient Google keys/tokens are not forwarded. Runtime/migration identities
have no bucket access. The backup identity has object administration in this one
repository; it can prune it, so this is encrypted off-server protection, **not an
immutable archive against compromise of that identity**. No object-age lifecycle
may delete restic chunks. Retention is enforced by restic: seven daily snapshots,
zero hourly. It can retain more than seven wall-clock days when successful days
are missing; operators monitor protected-data age independently.

Daily protection is scheduled every 23 hours to reserve two 30-minute job bounds
within the approved 24-hour target. The Scheduler API supports this
[groc interval](https://docs.cloud.google.com/scheduler/docs/configuring/cron-job-schedules#alternative_job_format).
Freshness checks run every six hours and read encrypted repository metadata without
opening the database. A completed archive retains its conservative protected-time
tag; an upload timestamp or ephemeral job-local status file cannot prove freshness.
Missing, incomplete, future, foreign or invalid metadata does not pass. An initial
manual successful age execution seeds the absence monitor before enabling schedules.

Alerts cover application/database/booking failure categories, repeated authentication
failure signals, failed backup/age
executions, missing successful freshness checks and Cloud Run 5xx responses.
Periodic external liveness is opt-in with `external_liveness: true`; it checks
`/health` every 15 minutes. The endpoint itself never queries the database, but a
Java cold start validates the schema and wakes Neon. Defaulting these probes off
avoids that repeated idle compute. Without them, a zero-traffic outage is discovered
on the next request. Qualify that availability tradeoff with the Owner before launch,
or enable the external check after measuring its impact on Free compute.
Actual metric labels, Scheduler behavior, notification delivery and cold-start
latency require selected-host qualification. Authentication warning logs are rate-limited;
that alert counts signal bursts, not every rejected request. Counters remain process-local in the
Compose monitor; Cloud mode uses fixed logs/provider metrics, not public metrics.

For recovery, use a separate new Neon target, never the primary endpoint, and a
dedicated operator-only restore identity. Copy
[the v2 job template](../deploy/cloud/restore-job.example.json) outside git and fill
in an exact source snapshot, digest, source backup host/repository and target host.
Grant that identity only source-bucket object viewing and access to the source
archive password plus a **separate target migration-password secret**. It must have
no production runtime/migration password access. Do not grant the scheduler or
publisher actAs/run access. Pause source repository writers during read-only verify
and restore; these use `--no-lock` and cannot coordinate with a concurrent prune.
Create/execute the job with explicit personal project selectors, no automatic
retries, and wait/read back its execution. The importer independently refuses a
populated public schema. It then purges sessions and changes staff generations in
one audited transaction. Keep the target quarantined after any failure.

Apply restricted target grants, run the matching-image `check-schema`, authorize
`recover-owner` offline with the target migration credential and the private Owner
email, then reconcile business/configuration/financial/audit contents and verify
old cookies are rejected. The template is not a live recovery qualification.
Record a timed off-server rehearsal within the approved 24-hour recovery target
before launch. Only a reviewed cutover may change the app endpoint after recovery.

## Cost controls and launch inputs

This aims for Free compute/database usage at a small intermittent workload, not a
guaranteed zero bill. ABL shares the personal billing account's free allowances.
Keep Neon on Free, scale both systems to zero, review image storage and measured
CU-hours, and create a small notification budget before exposure (default 5, with
`billing_currency` matching the actual personal account USD/EUR currency). A
budget alerts; it does not cap or automatically shut down the service.

As checked on November 8, 2026, Neon advertises 100 CU-hours/month and 1 GB per Free
project. Monitor the actual account limits rather than assuming continuous use
fits. [Neon pricing](https://neon.com/pricing).
Cloud Run's free allowance is account-wide and Frankfurt has its own usage rates.
[Cloud Run pricing](https://cloud.google.com/run/pricing).
Frankfurt GCS backup/state storage, registry storage/transfer and excess secret
versions or schedules may cost small amounts even with free compute. Scheduler
includes three jobs per billing account and otherwise charges USD 0.10/job/month,
including paused jobs; this setup uses two per business/environment.
[Scheduler pricing](https://cloud.google.com/scheduler/pricing).
Secret Manager includes six active versions account-wide; this setup uses seven
per business/environment. [Secret pricing](https://cloud.google.com/secret-manager/pricing).
Review [GCS](https://cloud.google.com/storage/pricing) and
[registry pricing](https://cloud.google.com/artifact-registry/pricing) with actual
volumes. No paid provider plan or custom domain is selected by these templates.

Still needed before deployment: actual project/billing/Neon references, private
operator configuration, Villas Google clients and secrets, notification ownership,
observed personal-account cost/availability limits, and the real-service checks
above. Hosting architecture, account ownership and seven-day backup retention are
already approved and do not need to be asked again.
