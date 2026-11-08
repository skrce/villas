# Deployment

Milestone 10 is active. Hosting, domain, availability, operating cost and off-server
backup configuration remain open under D04. This repository does not provision an
account or use another project's infrastructure. Real Google acceptance and the
staff pilot remain required. See [release-checklist.md](release-checklist.md).

## Release artifacts and verification

The application image contains the verified Spring Boot JAR and Vite `dist` from
the same revision. Docker does not rebuild the JAR. `scripts/build-release.mjs`
copies only these artifacts into a temporary context. Source, `.env`, local state,
test classes and credentials are excluded. Separate images contain the TLS proxy
configuration and backup/monitoring tools. Base images are pinned in `deploy/images.json`; MariaDB is pinned
in `mariadb-image.txt`. Review dependency/security updates before rebuilding.

```sh
node scripts/check.mjs
node scripts/build-release.mjs
node scripts/release-check.mjs
```

The release rehearsal owns a random Docker Compose project, private temporary files
and loopback ports 15073, 19108 and 19443. Run it separately from the regular browser
gate. It deletes only its own volumes/files and preserves private recovery settings
if cleanup fails. It never reads `.env.local`, copies `.local-state`, uses a cloud
account or changes a retained demo.

The rehearsal first starts production Google configuration with synthetic client
settings, without contacting Google. It verifies empty initialization, migration
reruns, denied runtime DDL/history rewrites, readiness during a database outage,
HTTPS, canonical Google authorization redirects, Secure/HttpOnly/host-only cookies,
CSP, deep links, protected APIs and hidden internal endpoints. It then runs the staff
browser suite through the proxy using loopback synthetic OIDC. Its external test
clock and identity fixture are mounted only for that phase and are absent from the
release image. The browser phase uses the non-root test runner's UID to read its
private clock file. Production uses the image's UID 10001.

The same rehearsal also streams an encrypted backup, checks repository data,
restores through the standalone reference, compares business/configuration/audit
contents, verifies session quarantine and starts the restored app. It rejects failed
dumps and repeated imports into populated targets. Temporary volumes are explicitly
owned, removed and checked after cleanup.

CI's `release-package` job consumes backend/frontend artifacts after their checks
succeed, builds all three images and runs the rehearsal. These are not deployed images.
A registry, provider credentials and environment deployment jobs require D04.
Record registry digests and artifact checksums before deployment. Never deploy
mutable tags such as `latest`.

Builds invalidate earlier manifests before attempting Docker work. The manifest binds
the current Git revision/source tree, JAR/dist checksums and all three image IDs.
The rehearsal rejects changed inputs or retagged images before creating resources.
Dirty development builds require `--local-rehearsal`, use a local-only image name
and are identified in the manifest. Use a clean committed revision for a release.

## Releasing a later change

The repository currently runs checks, builds images and rehearses them locally in
CI. It does not publish images to a registry or deploy to staging/production. Add
those jobs after D04 is resolved, with this delivery sequence:

1. Merge a reviewed PR and require successful checks for the exact `master` commit.
2. Publish the verified images for that commit and record immutable registry digests.
   Promote the same images between environments; do not rebuild for production.
3. Deploy to separate staging and verify the changed workflow with synthetic data,
   real Google access and the applicable browser checks.
4. Require an explicit production release. Record previous images/schema, verify
   the off-server backup, close public writes and stop the app as described in
   [controlled startup and upgrades](#controlled-startup-and-upgrades).
5. Apply pending migrations and reviewed runtime grants, then start the selected
   images against the retained production database. Owner bootstrap and empty
   database initialization are first-install operations, not routine upgrade steps.
6. Verify readiness, actual HTTPS/login, protected access and operational signals
   before reopening writes. Record results and image/schema versions. Follow the
   compatibility and recovery rules below if verification fails.

Use separate staging/production configuration, serialize releases per environment
and give deployment jobs restricted, short-lived credentials where supported.
GitHub's intended operator flow is to select a verified release for staging, inspect
it, then explicitly promote it to production. Those release controls still need
implementation. Until then, the reference below is an operator runbook, not a
working GitHub deployment action.

## Reference environment

`deploy/compose.yaml` is a Linux Docker Compose reference, not a hosting decision.
Use separate staging and production projects, volumes, domains, Google clients,
secrets, backup repositories and monitoring identities. Only the proxy publishes
80/443; neither database nor app has a public port. Configure the host firewall,
restricted operator access, disk encryption, capacity and updates for the chosen host.

The app runs without root, on a read-only filesystem, with limited memory/PIDs,
no Linux capabilities and bounded writable `/tmp`. Caddy handles TLS and redirects.
Confirm DNS, challenge connectivity and certificate renewal in the actual environment
as described in [Caddy's HTTPS guide](https://caddyserver.com/docs/automatic-https).

The proxy strips forwarding headers; Spring ignores them. The configured HTTPS
origin determines callbacks and write Origin checks. Review trusted hops before
adding another public proxy. The public proxy hides `/internal/*`, API docs and
actuator paths. Private liveness is process-only; readiness requires successful
history for all bundled SQL migration versions. Delivery still validates checksums
through Flyway. Health responses disclose only status.

The app serves explicit frontend routes and hashed assets. APIs, OIDC callbacks
and missing assets never fall back to `index.html`. The public shell contains no
business data and does not extend staff sessions. APIs still require a current Owner.

## Secrets and database accounts

Create an absolute directory outside git with mode `0700`. Store separate random
64-character lowercase hexadecimal passwords in `db_root`, `db_migration`,
`db_runtime` and `db_backup`, plus `google_client_id` and `google_client_secret`.
File-backed Compose secrets retain host permissions. Use `0444` files inside the
private `0700` parent so non-root container UIDs can read specific mounted files.
Never expose/mount the entire parent. Verify this on the chosen host. Docker access
is privileged access to these files.

The app accepts `_FILE` settings for DB URL/user/password, Google client ID/secret
and initial Owner email. Each must name an absolute readable regular file with one
nonempty line, at most 16 KiB. Simultaneous direct and file settings fail startup.
Errors omit private paths/contents. This does not enable staff password login.

First-volume initialization creates schema-local migration, runtime and read-only
backup accounts. The app gets explicit grants after migrations. It can append
ledger, accepted prices and audit history, but cannot rewrite/delete them, run DDL
or edit Flyway history. Root/migration secrets are never mounted in the web app.
Changing secret files does not rotate existing users automatically. Rehearse explicit
rotation and revocation separately.

Backup and alert secrets are mounted only in their respective operational services.
Configure them through [recovery.md](recovery.md) and [operations.md](operations.md)
after approving D04. Use `deploy/backup.compose.yaml` with the reference environment;
use `deploy/restore.compose.yaml` standalone in a new isolated project. The latter
has no public app or ports and uses new target database credentials.

## Controlled startup and upgrades

Do not provision until D04 and the environment checklist are approved. Keep an
absolute private environment file with these nonsecret references:

```dotenv
VILLAS_APP_IMAGE=registry.example/villas-app@sha256:FULL_DIGEST
VILLAS_PROXY_IMAGE=registry.example/villas-proxy@sha256:FULL_DIGEST
VILLAS_MARIADB_IMAGE=EXACT_CONTENT_OF_mariadb-image.txt
VILLAS_DOMAIN=CONFIRMED_DOMAIN
VILLAS_SECRET_DIR=/absolute/private/villas-secrets
```

Use an explicit personal Docker context, project, env file and `deploy/compose.yaml`
on every command. Review rendered configuration privately. In order:

1. `up --detach --wait db` on a new volume. Never truncate/reuse an existing DB.
2. `run --rm migrate`. A failure leaves traffic closed.
3. Apply `deploy/runtime-grants.sql` through local-root `compose exec -T db`, using
   `MYSQL_PWD` read from `/run/secrets/db_root`, without printing it.
4. Verify all business tables and staff/invitations are empty.
5. Run offline `bootstrap-owner` once, mounting a private `initial_owner` file and
   setting `VILLAS_INITIAL_OWNER_EMAIL_FILE` only for that one-off container. It
   creates an invitation and still requires Google. Keep the real address out of git.
6. `up --detach --wait api proxy`, then complete deployed staging/Google/pilot gates.
7. Initialize separate empty production. Configure rooms/rates and real bookings
   through the app later. Do not import staging fixtures.

For upgrades, close public writes, verify an off-server backup, record old image
digests/schema version, stop the app, then run the new image's one-off migration.
Apply reviewed grants for new tables before starting it. A failed migration may
have committed partial MariaDB DDL. Inspect privately; never infer no change from
an error. Do not start an app whose readiness or migrations fail.

There are no automatic down migrations, clean/baseline shortcuts or automatic
schema rollback. An old image may run only after proving schema compatibility in
staging. Otherwise use a reviewed forward fix or an isolated verified restore,
reconciling later externally completed payments before reopening writes. See
[migrations.md](migrations.md) and [recovery.md](recovery.md).
