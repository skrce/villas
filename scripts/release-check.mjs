import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import { directoryDigest, git, sha256, treeDigest } from './release-artifacts.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const verification = join(root, 'target/release/verified.json');
rmSync(verification, { force: true });
const build = JSON.parse(readFileSync(join(root, 'target/release/build.json'), 'utf8'));
if (build.source !== git(root, 'rev-parse', 'HEAD') || build.sourceTree !== treeDigest(root) ||
    !/^villarosa-[-A-Za-z0-9.]+\.jar$/.test(build.jar ?? '') || build.jarSha256 !== sha256(join(root, 'target', build.jar)) ||
    build.webSha256 !== directoryDigest(join(root, 'frontend/dist'))) throw new Error('Release manifest does not match this source and its artifacts. Build the current revision first.');
const pins = JSON.parse(readFileSync(join(root, 'deploy/images.json'), 'utf8'));
const instance = `e2e-${randomBytes(6).toString('hex')}`;
const project = `villas-release-${instance}`;
const state = mkdtempSync(join(tmpdir(), `${project}-`));
chmodSync(state, 0o700);
const secrets = join(state, 'secrets');
mkdirSync(secrets, { mode: 0o700 });
const file = (path, value, mode = 0o600) => writeFileSync(path, value, { mode });
for (const name of ['db_root', 'db_migration', 'db_runtime', 'db_backup']) file(join(secrets, name), randomBytes(32).toString('hex'), 0o444);
file(join(secrets, 'google_client_id'), '123456-release.apps.googleusercontent.com', 0o444);
file(join(secrets, 'google_client_secret'), randomBytes(32).toString('hex'), 0o444);
file(join(secrets, 'initial_owner'), 'owner@example.test', 0o444);
file(join(state, 'env'), '');
const cleanEnvironment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('VILLAS_') && !name.startsWith('SPRING_')));
const environment = {
  ...cleanEnvironment,
  VILLAS_APP_IMAGE: build.appId,
  VILLAS_PROXY_IMAGE: build.proxyId,
  VILLAS_PROPERTY_ID: 'rehearsal-garden',
  VILLAS_PROPERTY_NAME: 'Rehearsal Garden',
  VILLAS_POSTGRES_IMAGE: readFileSync(join(root, 'postgres-image.txt'), 'utf8').trim(),
  VILLAS_DOMAIN: 'localhost',
  VILLAS_SECRET_DIR: secrets,
};
let child;
let interrupted;
let cleaning = false;
let passed = false;
const stop = signal => { interrupted ??= signal; child?.kill('SIGTERM'); };
const onInt = () => stop('SIGINT');
const onTerm = () => stop('SIGTERM');
process.on('SIGINT', onInt); process.on('SIGTERM', onTerm);
const run = (command, args, { input, capture = false, allowFailure = false, env = environment, timeout = 180_000 } = {}) => new Promise((resolve, reject) => {
  if (interrupted && !cleaning) return reject(new Error('Release check interrupted.'));
  const current = spawn(command, args, { cwd: root, env, stdio: ['pipe', capture ? 'pipe' : 'inherit', capture ? 'pipe' : 'inherit'] });
  child = current;
  let output = '';
  current.stdout?.on('data', chunk => { output += chunk; if (output.length > 4_194_304) current.kill('SIGTERM'); });
  // SQL/probe failures can include private details, so captured errors never reach the transcript.
  current.stderr?.resume();
  let force;
  const timer = setTimeout(() => { current.kill('SIGTERM'); force = setTimeout(() => current.kill('SIGKILL'), 8_000); }, timeout);
  current.once('error', error => { clearTimeout(timer); reject(error); });
  current.once('close', code => {
    clearTimeout(timer); clearTimeout(force); if (child === current) child = undefined;
    if (interrupted && !cleaning) return reject(new Error('Release check interrupted.'));
    if (code !== 0 && !allowFailure) reject(new Error(`Release check command failed (${command}, exit ${code}).`));
    else resolve({ code, output: output.trim() });
  });
  current.stdin.end(input);
});
const configFile = join(state, 'compose.json');
const compose = (args, options) => run('docker', ['compose', '--project-name', project, '--env-file', join(state, 'env'), '--file', configFile, '--profile', 'operations', ...args], options);
const sql = async (input, user = 'root', allowFailure = false, service = 'db') => {
  const secret = user === 'root' ? 'db_root' : user === 'villas_runtime' ? 'db_runtime' : user === 'villas_backup' ? 'db_backup' : 'db_migration';
  return compose(['exec', '-T', service, 'sh', '-c', `PGPASSWORD="$(cat /run/secrets/${secret})" exec psql --username=${user === 'root' ? 'villas_root' : user} --dbname=villarosa --no-psqlrc --quiet --tuples-only --no-align --field-separator='	' --set=ON_ERROR_STOP=1`], { input, capture: true, allowFailure });
};
const checkPorts = async () => {
  for (const port of [15073, 19108, 19443, 19453]) await new Promise((resolve, reject) => {
    const socket = createServer(); socket.once('error', () => reject(new Error(`Release check requires an unused loopback port ${port}.`)));
    socket.listen(port, '127.0.0.1', () => socket.close(resolve));
  });
};
const proxyConfig = readFileSync(join(root, 'deploy/Caddyfile'), 'utf8');
file(join(state, 'Tls.Caddyfile'), proxyConfig.replace('{$VILLAS_SITE} {', '{$VILLAS_SITE} {\n\ttls internal'), 0o644);
let config;
const saveConfig = () => file(configFile, JSON.stringify(config));
const apiBase = 'https://localhost:19443';

try {
  if (process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith('unix://')) throw new Error('Release rehearsal requires a local Unix Docker socket.');
  const context = await run('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], { capture: true });
  if (!process.env.DOCKER_HOST && !context.output.startsWith('unix://')) throw new Error('Release rehearsal requires a local Unix Docker context.');
  for (const [id, tag] of [[build.appId, build.app], [build.proxyId, build.proxy], [build.backupId, build.backup]]) {
    if (!/^sha256:[a-f0-9]{64}$/.test(id ?? '')) throw new Error('Release image identity is missing. Rebuild the current revision.');
    const inspected = await run('docker', ['image', 'inspect', tag, '--format', '{{json .}}'], { capture: true });
    const image = JSON.parse(inspected.output);
    if (image.Id !== id || image.Config.Labels['org.opencontainers.image.revision'] !== build.source) throw new Error('Release image identity does not match the manifest.');
  }
  await checkPorts();
  const resolved = await run('docker', ['compose', '--project-name', project, '--env-file', join(state, 'env'), '--file', join(root, 'deploy/compose.yaml'), '--profile', 'operations', 'config', '--format', 'json'], { capture: true });
  config = JSON.parse(resolved.output);
  delete config.name;
  config.services.maintenance = {
    image: build.proxyId,
    entrypoint: ['caddy'],
    command: ['run', '--config', '/etc/caddy/maintenance.Caddyfile', '--adapter', 'caddyfile'],
    ports: [{ target: 8080, published: '19453', host_ip: '127.0.0.1' }],
  };
  config.services.db.volumes = config.services.db.volumes.map(volume => volume.type === 'bind' ? { ...volume, source: join(root, 'deploy/init-db.sh') } : volume);
  config.services.api.ports = [{ target: 8443, published: '19443', host_ip: '127.0.0.1' }, { target: 8080, published: '15073', host_ip: '127.0.0.1' }, { target: 19108, published: '19108', host_ip: '127.0.0.1' }];
  config.services.proxy.network_mode = 'service:api'; delete config.services.proxy.networks; delete config.services.proxy.ports;
  config.services.proxy.environment.VILLAS_SITE = 'https://localhost:8443';
  config.services.proxy.environment.VILLAS_UPSTREAM = '127.0.0.1:9098';
  config.services.proxy.volumes.push({ type: 'bind', source: join(state, 'Tls.Caddyfile'), target: '/etc/caddy/Caddyfile', read_only: true });
  config.services.api.environment.VILLAS_PUBLIC_URL = apiBase;
  config.services.api.environment.VILLAS_BIND_ADDRESS = '127.0.0.1';
  saveConfig();
  await compose(['up', '--detach', '--wait', 'maintenance']);
  let maintenance;
  for (let attempt = 0; attempt < 30; attempt++) {
    try { maintenance = await fetch('http://127.0.0.1:19453/health', { signal: AbortSignal.timeout(1000) }); if (maintenance.ok) break; } catch { /* The owned static server is starting. */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.equal(maintenance?.status, 200);
  const paused = await fetch('http://127.0.0.1:19453/api/v1/apartments', { signal: AbortSignal.timeout(2000) });
  assert.equal(paused.status, 503);
  assert.equal(paused.headers.get('cache-control'), 'no-store');
  await compose(['stop', 'maintenance']);
  await compose(['up', '--detach', '--wait', '--wait-timeout', '120', 'db']);
  await compose(['run', '--rm', 'migrate']);
  await compose(['run', '--rm', 'migrate']);
  const registry = await sql('SELECT id,name FROM businesses ORDER BY id;');
  assert.equal(registry.output, 'rehearsal-garden\tRehearsal Garden', 'Migration and web jobs must use the same configured business identity and name.');
  await sql(readFileSync(join(root, 'deploy/runtime-grants.sql'), 'utf8'));
  await sql('BEGIN; SELECT property_id FROM staff_property_lock FOR UPDATE; ROLLBACK;', 'villas_runtime');
  const empty = await sql('SELECT (SELECT COUNT(*) FROM apartments)+(SELECT COUNT(*) FROM customers)+(SELECT COUNT(*) FROM reservations)+(SELECT COUNT(*) FROM staff_accounts)+(SELECT COUNT(*) FROM staff_invitations)+(SELECT COUNT(*) FROM ledger_entries);');
  assert.equal(empty.output, '0', 'Production initialization must be empty.');
  for (const statement of [
    'CREATE TABLE villas_forbidden(id INT);',
    'UPDATE ledger_entries SET amount_cents=1 WHERE id=0;',
    'DELETE FROM business_events WHERE id=0;',
    "UPDATE reservation_prices SET quote_json='{}' WHERE id='no-record';",
    "UPDATE flyway_schema_history SET checksum=0 WHERE installed_rank=0;",
    "UPDATE property_identity SET property_id='foreign' WHERE singleton=1;",
    "UPDATE staff_property_lock SET property_id='foreign' WHERE property_id='rehearsal-garden';",
  ]) assert.notEqual((await sql(statement, 'villas_runtime', true)).code, 0, 'Runtime credentials must reject schema/history mutations.');
  await compose(['up', '--detach', '--wait', '--wait-timeout', '150', 'api', 'proxy']);
  await compose(['exec', '-T', 'api', 'java', '-jar', '/app/villas.jar', 'healthcheck']);
  const imageUser = await run('docker', ['image', 'inspect', build.app, '--format', '{{.Config.User}}'], { capture: true });
  assert.equal(imageUser.output, '10001:10001');
  const { chromium } = await import(join(root, 'frontend/node_modules/playwright/index.mjs'));
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, baseURL: apiBase });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/calendar');
    await page.getByRole('button', { name: /sign in with google/i }).waitFor();
    for (const path of ['/internal/health/live', '/internal/health/ready', '/internal/metrics', '/v3/api-docs', '/swagger-ui/index.html']) {
      assert.equal((await context.request.get(path)).status(), 404, 'The public proxy must hide internal endpoints.');
    }
    assert.equal((await context.request.get('/api/v1/apartments')).status(), 401);
    assert.equal((await context.request.get('/assets/missing.js')).status(), 404);
    const start = await context.request.get('/oauth2/authorization/google', { maxRedirects: 0, headers: { 'X-Forwarded-Host': 'attacker.example', 'X-Forwarded-Proto': 'http', Forwarded: 'host=attacker.example;proto=http' } });
    assert.equal(start.status(), 302);
    const redirect = new URL(start.headers().location);
    assert.equal(redirect.origin, 'https://accounts.google.com');
    assert.equal(redirect.searchParams.get('redirect_uri'), `${apiBase}/login/oauth2/code/google`);
    const cookie = (await context.cookies()).find(value => value.name === '__Host-villas');
    assert(cookie?.secure && cookie.httpOnly && cookie.sameSite === 'Lax' && cookie.path === '/');
    assert(start.headers()['strict-transport-security']?.includes('31536000'));
    assert.equal(errors.length, 0, 'The packaged shell must run without script/CSP errors.');
    await context.close();
  } finally { await browser.close(); }
  await compose(['stop', 'db']);
  const unavailable = await compose(['exec', '-T', 'api', 'java', '-jar', '/app/villas.jar', 'healthcheck'], { capture: true, allowFailure: true });
  assert.notEqual(unavailable.code, 0, 'Readiness must fail during a database outage.');
  await compose(['stop', 'proxy', 'api']);
  await compose(['up', '--detach', '--wait', '--wait-timeout', '120', 'db']);

  const clock = join(state, 'clock'); mkdirSync(join(clock, 'META-INF/spring'), { recursive: true });
  file(join(clock, 'META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports'), 'com.villas.browser.BrowserClockConfiguration\n');
  const archive = spawnSync(process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin/jar') : 'jar', ['--create', '--file', join(clock, 'clock.jar'), '-C', join(root, 'target/test-classes'), 'com/villas/browser/BrowserClockConfiguration.class', '-C', join(root, 'target/test-classes'), 'com/villas/browser/BrowserFileClock.class', '-C', clock, 'META-INF'], { stdio: 'inherit' });
  if (archive.status !== 0) throw new Error('Compile the external browser clock fixture before the release check.');
  const syntheticSecret = randomBytes(32).toString('hex');
  const publicUrl = 'http://127.0.0.1:15073';
  const synthetic = { VILLAS_MODE: 'local', VILLAS_AUTH_PROVIDER: 'synthetic', VILLAS_PUBLIC_URL: publicUrl, VILLAS_SYNTHETIC_ISSUER: 'http://localhost:19108', VILLAS_GOOGLE_CLIENT_ID: 'villas-test', VILLAS_GOOGLE_CLIENT_SECRET: syntheticSecret, VILLAS_LOCAL_INSTANCE: instance };
  Object.assign(config.services.api.environment, synthetic, { SPRING_PROFILES_ACTIVE: 'local', VILLAS_BROWSER_CLOCK_FILE: '/clock/instant.txt' });
  delete config.services.api.environment.VILLAS_GOOGLE_CLIENT_ID_FILE; delete config.services.api.environment.VILLAS_GOOGLE_CLIENT_SECRET_FILE;
  // Match the non-root test runner only so its private clock file remains readable. The production image's UID is tested above.
  const uid = process.getuid(); if (uid === 0) throw new Error('Run the release browser rehearsal as a non-root user.');
  config.services.api.user = `${uid}:${process.getgid()}`;
  config.services.api.entrypoint = ['java', '-Dloader.path=/clock/clock.jar', '-cp', '/app/villas.jar', 'org.springframework.boot.loader.launch.PropertiesLauncher'];
  config.services.api.volumes = [{ type: 'bind', source: clock, target: '/clock', read_only: true }];
  config.services.api.secrets = [{ source: 'db_runtime' }];
  config.services.owner = {
    ...config.services.migrate,
    command: ['bootstrap-owner'],
    environment: { ...config.services.migrate.environment, VILLAS_OWNER_BUSINESS_ID: 'rehearsal-garden', VILLAS_INITIAL_OWNER_EMAIL_FILE: '/run/secrets/initial_owner' },
    secrets: [{ source: 'db_migration' }, { source: 'initial_owner' }],
  };
  config.secrets.initial_owner = { file: join(secrets, 'initial_owner') };
  config.services.proxy.environment.VILLAS_SITE = 'http://127.0.0.1:8080';
  config.services.proxy.volumes = config.services.proxy.volumes.filter(volume => volume.target !== '/etc/caddy/Caddyfile');
  config.services.identity = { image: pins.testNode, network_mode: 'service:api', user: `${uid}:${process.getgid()}`, environment: { ...synthetic, VILLAS_CONTAINER_REHEARSAL: '1' }, volumes: [{ type: 'bind', source: join(root, 'scripts/test-identity-provider.mjs'), target: '/fixture.mjs', read_only: true }], command: ['node', '/fixture.mjs'], logging: config.services.api.logging };
  saveConfig();
  await sql(readFileSync(join(root, 'dev/fixtures.sql'), 'utf8').replaceAll('__VILLAS_FIXTURE_BUSINESS__', 'rehearsal-garden'));
  await compose(['run', '--rm', 'owner']);
  config.services.onboard = { ...config.services.owner, command: ['onboard-business'], environment: { ...config.services.owner.environment, VILLAS_NEW_BUSINESS_ID: 'rehearsal-garden-lake', VILLAS_NEW_BUSINESS_NAME: 'Lake business · Синтетички апартмани' } };
  saveConfig();
  await compose(['run', '--rm', 'onboard']);
  await compose(['up', '--detach', '--wait', '--wait-timeout', '150', 'api', 'proxy', 'identity']);
  await run(process.execPath, ['frontend/node_modules/@playwright/test/cli.js', 'test', '--config', 'frontend/playwright.release.config.ts', '--max-failures=1'], { env: { ...cleanEnvironment, ...synthetic, VILLAS_PROPERTY_ID: 'rehearsal-garden', VILLAS_PROPERTY_NAME: 'Rehearsal Garden', VILLAS_BROWSER_CLOCK_FILE: join(clock, 'instant.txt') }, timeout: 600_000 });
  const signedIn = await chromium.launch({ headless: true });
  let savedCookies;
  try {
    const page = await signedIn.newPage(); await page.goto(`${publicUrl}/businesses/rehearsal-garden/today`);
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Sign in to local demo' }).click();
    const popup = await popupPromise; await popup.getByRole('button', { name: 'Synthetic Owner', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out' }).waitFor();
    savedCookies = await page.context().cookies();
  } finally { await signedIn.close(); }
  await compose(['stop', 'proxy', 'identity', 'api']);
  const unsupported = await sql("SELECT (SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema='public')+(SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema='public' AND routine_name NOT IN ('villas_has_business','villas_identity_matches','villas_identity_business','villas_admission_business'))+(SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type<>'BASE TABLE'); ");
  assert.equal(unsupported.output, '0', 'Logical backup permits only the bundled row-security helpers and base tables.');
  await sql("INSERT INTO customers(property_id,first_name,last_name) VALUES('rehearsal-garden-lake','Second business','Synthetic');");
  assert.equal((await sql("SELECT COUNT(DISTINCT property_id) FROM customers;", 'villas_backup')).output, '2', 'Backup authority must read both businesses.');
  await sql(`INSERT INTO recovery_events(id,property_id,snapshot_id,invalidated_sessions,changed_staff,occurred_at) VALUES(gen_random_uuid()::text,'rehearsal-garden','${'f'.repeat(64)}',0,0,CURRENT_TIMESTAMP(6));`);
  const fingerprint = async (service, excludeSnapshot) => {
    const tables = (await sql("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;", 'root', false, service)).output.split('\n');
    const result = {};
    for (const table of tables) {
      assert(/^[A-Za-z0-9_]+$/.test(table));
      if (['spring_session', 'spring_session_attributes'].includes(table)) continue;
      const selected = table === 'staff_accounts' ? 'id,property_id,issuer,subject,email,role,active,version,created_at' : '*';
      const where = table === 'recovery_events' && excludeSnapshot ? ` WHERE snapshot_id<>'${excludeSnapshot}'` : '';
      const rows = (await sql(`SET TIME ZONE 'UTC'; SELECT ${selected} FROM ${table}${where};`, 'root', false, service)).output.split('\n').sort().join('\n');
      result[table] = createHash('sha256').update(rows).digest('hex');
    }
    return result;
  };
  await sql("CREATE TABLE restore_stream_probe(id INT PRIMARY KEY,payload BYTEA NOT NULL); INSERT INTO restore_stream_probe SELECT i,decode(string_agg(md5(random()::text),''),'hex') FROM generate_series(1,128) i CROSS JOIN generate_series(1,512) j GROUP BY i;", 'villas_migration');
  const original = await fingerprint('db');
  const generations = (await sql('SELECT id,property_id,security_version FROM staff_accounts ORDER BY id;')).output;
  const sessions = Number((await sql('SELECT COUNT(*) FROM SPRING_SESSION;')).output);
  assert(sessions > 0, 'Backup must contain a formerly valid session for the revocation proof.');
  file(join(secrets, 'backup_repository'), '/repo', 0o444);
  file(join(secrets, 'backup_password'), randomBytes(32).toString('hex'), 0o444);
  file(join(secrets, 'backup_credentials.json'), '{}', 0o444);
  for (const name of ['backup_repository', 'backup_password']) config.secrets[name] = { file: join(secrets, name) };
  config.volumes.repository = { name: `${project}_repository` };
  config.volumes.backup_status = { name: `${project}_backup_status` };
  config.volumes.restored_database = { name: `${project}_restored_database` };
  config.services.backup = {
    image: build.backupId, profiles: ['operations'], read_only: true,
    tmpfs: ['/tmp:rw,noexec,nosuid,size=128m'], cap_drop: ['ALL'], security_opt: ['no-new-privileges:true'], mem_limit: '512m', pids_limit: 128,
    environment: { VILLAS_BACKUP_DB_SSLMODE: 'disable', VILLAS_BACKUP_DB_HOST: 'db', VILLAS_BACKUP_DB_PASSWORD_FILE: '/run/secrets/db_backup', VILLAS_BACKUP_REPOSITORY_FILE: '/run/secrets/backup_repository', VILLAS_BACKUP_PASSWORD_FILE: '/run/secrets/backup_password', VILLAS_BACKUP_LOCAL_REHEARSAL: '1', VILLAS_LOCAL_INSTANCE: instance, VILLAS_BACKUP_HOST: `villas-rehearsal-${instance}`, VILLAS_KEEP_HOURLY: '0', VILLAS_KEEP_DAILY: '2', VILLAS_BACKUP_STATUS_FILE: '/status/backup.json' },
    secrets: [{ source: 'db_backup' }, { source: 'backup_repository' }, { source: 'backup_password' }],
    volumes: [{ type: 'volume', source: 'repository', target: '/repo' }, { type: 'volume', source: 'backup_status', target: '/status' }], logging: config.services.api.logging,
  };
  config.services['monitor-check'] = {
    image: build.backupId, profiles: ['operations'], network_mode: 'service:api', entrypoint: ['node', '/ops/monitor.mjs'], command: ['once'], read_only: true,
    environment: { VILLAS_DEPLOY_ENVIRONMENT: 'rehearsal', VILLAS_BACKUP_MAX_AGE_SECONDS: '3600', VILLAS_BACKUP_STATUS_FILE: '/status/backup.json', VILLAS_MONITOR_STATUS_FILE: '/status/monitor.json' },
    volumes: [{ type: 'volume', source: 'backup_status', target: '/status' }], logging: config.services.api.logging,
  };
  saveConfig();
  await compose(['run', '--rm', 'backup', 'init']);
  const failedBackup = await compose(['run', '--rm', '-e', 'VILLAS_BACKUP_DB_PASSWORD_FILE=/run/secrets/backup_password', 'backup', 'backup'], { capture: true, allowFailure: true });
  assert.notEqual(failedBackup.code, 0, 'A failed dump cannot qualify as a backup even when the archiver accepts its stream.');
  assert.equal(JSON.parse((await compose(['run', '--rm', 'backup', 'snapshots'], { capture: true })).output).length, 0, 'Incomplete streams are never eligible for restoration.');
  await compose(['run', '--rm', 'backup', 'backup']);
  await compose(['run', '--rm', 'backup', 'verify']);
  const snapshots = JSON.parse((await compose(['run', '--rm', 'backup', 'snapshots'], { capture: true })).output);
  assert.equal(snapshots.length, 1); const snapshot = snapshots[0].id; assert(/^[a-f0-9]{64}$/.test(snapshot));
  const restoreReference = JSON.parse((await run('docker', ['compose', '--project-name', project, '--env-file', join(state, 'env'), '--file', join(root, 'deploy/restore.compose.yaml'), '--profile', 'operations', 'config', '--format', 'json'], { capture: true, env: { ...environment, VILLAS_BACKUP_IMAGE: build.backupId, VILLAS_BACKUP_HOST: `villas-rehearsal-${instance}`, VILLAS_RESTORE_SECRET_DIR: secrets, VILLAS_RESTORE_SNAPSHOT_ID: snapshot } })).output);
  Object.assign(config.services, restoreReference.services);
  Object.assign(config.secrets, restoreReference.secrets);
  Object.assign(config.volumes, restoreReference.volumes);
  Object.assign(config.services.restore.environment, { VILLAS_BACKUP_LOCAL_REHEARSAL: '1', VILLAS_LOCAL_INSTANCE: instance });
  config.services.restore.volumes = [{ type: 'volume', source: 'repository', target: '/repo' }];
  saveConfig();
  await compose(['up', '--detach', '--wait', '--wait-timeout', '120', 'restored-db']);
  await sql('ALTER SCHEMA public OWNER TO villas_root; GRANT USAGE,CREATE ON SCHEMA public TO villas_migration;', 'root', false, 'restored-db');
  const restoreArguments = ['run', '--rm', 'restore'];
  const startedAt = Date.now();
  await compose(restoreArguments);
  assert.equal((await sql("SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='public';", 'root', false, 'restored-db')).output, 'villas_root');
  assert.deepEqual(await fingerprint('restored-db', snapshot), original, 'Restore must preserve every business/configuration/operation/history row byte-for-byte.');
  const restoredGenerations = (await sql('SELECT id,property_id,security_version FROM staff_accounts ORDER BY id;', 'root', false, 'restored-db')).output;
  const expectedGenerations = generations.split('\n').map(row => { const [id, business, version] = row.split('\t'); return `${id}\t${business}\t${BigInt(version) + (business === 'rehearsal-garden' ? 1n : 0n)}`; }).join('\n');
  assert.equal(restoredGenerations, expectedGenerations, 'The portable compatibility quarantine advances its target membership generations; shared all-business quarantine remains #48.');
  const quarantine = (await sql(`SELECT (SELECT COUNT(*) FROM SPRING_SESSION),(SELECT COUNT(*) FROM SPRING_SESSION_ATTRIBUTES),snapshot_id,invalidated_sessions FROM recovery_events WHERE snapshot_id='${snapshot}';`, 'root', false, 'restored-db')).output;
  assert.equal(quarantine, `0\t0\t${snapshot}\t${sessions}`);
  assert.notEqual((await compose(restoreArguments, { capture: true, allowFailure: true })).code, 0, 'Restore must refuse an already populated target.');
  assert.deepEqual(await fingerprint('restored-db', snapshot), original);
  await sql(readFileSync(join(root, 'deploy/runtime-grants.sql'), 'utf8'), 'root', false, 'restored-db');
  await compose(['run', '--rm', 'validate-schema']);
  config.services.api.environment.VILLAS_DB_URL = 'jdbc:postgresql://restored-db:5432/villarosa'; saveConfig();
  await compose(['up', '--detach', '--wait', '--wait-timeout', '150', 'api', 'proxy', 'identity']);
  const restoredBrowser = await chromium.launch({ headless: true });
  try {
    const context = await restoredBrowser.newContext({ extraHTTPHeaders: { 'X-Villas-Business': 'rehearsal-garden' } }); await context.addCookies(savedCookies);
    assert.equal((await context.request.get(`${publicUrl}/api/v1/apartments`)).status(), 401, 'A formerly valid restored cookie must fail before new sign-in.');
    assert.equal((await context.request.get(`${publicUrl}/api/v1/apartments`, { headers: { 'X-Villas-Business': 'rehearsal-garden-lake' } })).status(), 401, 'Global session quarantine must also reject the former cookie in the second business.');
    const page = await context.newPage(); await page.goto(`${publicUrl}/businesses/rehearsal-garden/today`);
    const popupPromise = page.waitForEvent('popup'); await page.getByRole('button', { name: 'Sign in to local demo' }).click();
    const popup = await popupPromise; await popup.getByRole('button', { name: 'Synthetic Owner', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out' }).waitFor();
    assert.equal((await context.request.get(`${publicUrl}/api/v1/apartments`)).status(), 200);
    assert.equal((await context.request.get(`${publicUrl}/api/v1/apartments`, { headers: { 'X-Villas-Business': 'rehearsal-garden-lake' } })).status(), 200);
  } finally { await restoredBrowser.close(); }
  await compose(['run', '--rm', '--no-deps', 'monitor-check']);
  console.log(`Isolated encrypted restore and reconciliation passed in ${((Date.now() - startedAt) / 1000).toFixed(1)} seconds. This is local rehearsal evidence, not an off-server RPO/RTO guarantee.`);
  console.log('Release container checks passed: empty initialization, restricted runtime, TLS/Google authorization setup, outage readiness, synthetic staff browser workflows, encrypted restore/reconciliation and stale-session rejection. Live Google and deployed acceptance remain open.');
  passed = true;
} catch (error) {
  if (config) {
    try {
      const logs = await compose(['logs', '--no-color', '--tail', '150'], { capture: true, allowFailure: true });
      file(join(root, `target/release/diagnostic-${instance}.log`), logs.output);
    } catch { /* The original failure remains authoritative if diagnostics are unavailable. */ }
  }
  console.error(error.message); process.exitCode = interrupted === 'SIGINT' ? 130 : 1;
} finally {
  cleaning = true;
  if (config) {
    try {
      await compose(['down', '--volumes', '--remove-orphans'], { timeout: 120_000 });
      const remaining = await run('docker', ['volume', 'ls', '--filter', `label=com.docker.compose.project=${project}`, '--format', '{{.Name}}'], { capture: true });
      if (remaining.output) throw new Error('Owned release volumes remain after cleanup.');
      rmSync(state, { recursive: true, force: true });
    }
    catch { console.error(`Release cleanup failed. Private recovery configuration remains at ${state}.`); process.exitCode = 1; }
  } else rmSync(state, { recursive: true, force: true });
  process.off('SIGINT', onInt); process.off('SIGTERM', onTerm);
}
if (passed && !process.exitCode) {
  if (build.sourceTree !== treeDigest(root) || build.jarSha256 !== sha256(join(root, 'target', build.jar)) || build.webSha256 !== directoryDigest(join(root, 'frontend/dist'))) throw new Error('Release inputs changed during verification.');
  writeFileSync(verification, `${JSON.stringify({ source: build.source, buildSha256: sha256(join(root, 'target/release/build.json')), verifiedAt: new Date().toISOString() })}\n`);
}
