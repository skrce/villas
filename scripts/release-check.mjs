import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import { directoryDigest, git, sha256, treeDigest } from './release-artifacts.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
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
  VILLAS_MARIADB_IMAGE: readFileSync(join(root, 'mariadb-image.txt'), 'utf8').trim(),
  VILLAS_DOMAIN: 'localhost',
  VILLAS_SECRET_DIR: secrets,
};
let child;
let interrupted;
let cleaning = false;
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
const compose = (args, options) => run('docker', ['compose', '--project-name', project, '--env-file', join(state, 'env'), '--file', configFile, ...args], options);
const sql = async (input, user = 'root', allowFailure = false) => {
  const secret = user === 'root' ? 'db_root' : user === 'villas_runtime' ? 'db_runtime' : 'db_migration';
  return compose(['exec', '-T', 'db', 'sh', '-c', `MYSQL_PWD="$(cat /run/secrets/${secret})" exec mariadb --user=${user} --database=villarosa --batch --skip-column-names`], { input, capture: true, allowFailure });
};
const checkPorts = async () => {
  for (const port of [15073, 19108, 19443]) await new Promise((resolve, reject) => {
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
  for (const [id, tag] of [[build.appId, build.app], [build.proxyId, build.proxy]]) {
    if (!/^sha256:[a-f0-9]{64}$/.test(id ?? '')) throw new Error('Release image identity is missing. Rebuild the current revision.');
    const inspected = await run('docker', ['image', 'inspect', tag, '--format', '{{json .}}'], { capture: true });
    const image = JSON.parse(inspected.output);
    if (image.Id !== id || image.Config.Labels['org.opencontainers.image.revision'] !== build.source) throw new Error('Release image identity does not match the manifest.');
  }
  await checkPorts();
  const resolved = await run('docker', ['compose', '--project-name', project, '--env-file', join(state, 'env'), '--file', join(root, 'deploy/compose.yaml'), '--profile', 'operations', 'config', '--format', 'json'], { capture: true });
  config = JSON.parse(resolved.output);
  delete config.name;
  config.services.db.volumes = config.services.db.volumes.map(volume => volume.type === 'bind' ? { ...volume, source: join(root, 'deploy/init-db.sh') } : volume);
  config.services.api.ports = [{ target: 8443, published: '19443', host_ip: '127.0.0.1' }, { target: 8080, published: '15073', host_ip: '127.0.0.1' }, { target: 19108, published: '19108', host_ip: '127.0.0.1' }];
  config.services.proxy.network_mode = 'service:api'; delete config.services.proxy.networks; delete config.services.proxy.ports;
  config.services.proxy.environment.VILLAS_SITE = 'https://localhost:8443';
  config.services.proxy.environment.VILLAS_UPSTREAM = '127.0.0.1:9098';
  config.services.proxy.volumes.push({ type: 'bind', source: join(state, 'Tls.Caddyfile'), target: '/etc/caddy/Caddyfile', read_only: true });
  config.services.api.environment.VILLAS_PUBLIC_URL = apiBase;
  config.services.api.environment.VILLAS_BIND_ADDRESS = '127.0.0.1';
  saveConfig();
  await compose(['up', '--detach', '--wait', '--wait-timeout', '120', 'db']);
  await compose(['run', '--rm', 'migrate']);
  await compose(['run', '--rm', 'migrate']);
  await sql(readFileSync(join(root, 'deploy/runtime-grants.sql'), 'utf8'));
  const empty = await sql('SELECT (SELECT COUNT(*) FROM apartments)+(SELECT COUNT(*) FROM customers)+(SELECT COUNT(*) FROM reservations)+(SELECT COUNT(*) FROM staff_accounts)+(SELECT COUNT(*) FROM staff_invitations)+(SELECT COUNT(*) FROM ledger_entries);');
  assert.equal(empty.output, '0', 'Production initialization must be empty.');
  for (const statement of [
    'CREATE TABLE villas_forbidden(id INT);',
    'UPDATE ledger_entries SET amount_cents=1 WHERE id=0;',
    'DELETE FROM business_events WHERE id=0;',
    "UPDATE reservation_prices SET quote_json='{}' WHERE id='no-record';",
    "UPDATE flyway_schema_history SET checksum=0 WHERE installed_rank=0;",
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
    for (const path of ['/internal/health/live', '/internal/health/ready', '/v3/api-docs', '/swagger-ui/index.html']) {
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
  config.services.api.secrets = [{ source: 'db_runtime' }, { source: 'initial_owner' }];
  config.services.api.environment.VILLAS_INITIAL_OWNER_EMAIL_FILE = '/run/secrets/initial_owner';
  config.secrets.initial_owner = { file: join(secrets, 'initial_owner') };
  config.services.proxy.environment.VILLAS_SITE = 'http://127.0.0.1:8080';
  config.services.proxy.volumes = config.services.proxy.volumes.filter(volume => volume.target !== '/etc/caddy/Caddyfile');
  config.services.identity = { image: pins.testNode, network_mode: 'service:api', user: `${uid}:${process.getgid()}`, environment: { ...synthetic, VILLAS_CONTAINER_REHEARSAL: '1' }, volumes: [{ type: 'bind', source: join(root, 'scripts/test-identity-provider.mjs'), target: '/fixture.mjs', read_only: true }], command: ['node', '/fixture.mjs'], logging: config.services.api.logging };
  saveConfig();
  await sql(readFileSync(join(root, 'dev/fixtures.sql'), 'utf8'));
  await compose(['run', '--rm', 'api', 'bootstrap-owner']);
  await compose(['up', '--detach', '--wait', '--wait-timeout', '150', 'api', 'proxy', 'identity']);
  await run(process.execPath, ['frontend/node_modules/@playwright/test/cli.js', 'test', '--config', 'frontend/playwright.release.config.ts', '--max-failures=1'], { env: { ...cleanEnvironment, ...synthetic, VILLAS_BROWSER_CLOCK_FILE: join(clock, 'instant.txt') }, timeout: 600_000 });
  console.log('Release container checks passed: empty initialization, restricted runtime, same-origin TLS/Google authorization setup, outage readiness, and synthetic staff browser workflows. Live Google and deployed acceptance remain open.');
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
    try { await compose(['down', '--volumes', '--remove-orphans'], { timeout: 120_000 }); rmSync(state, { recursive: true, force: true }); }
    catch { console.error(`Release cleanup failed. Private recovery configuration remains at ${state}.`); process.exitCode = 1; }
  } else rmSync(state, { recursive: true, force: true });
  process.off('SIGINT', onInt); process.off('SIGTERM', onTerm);
}
