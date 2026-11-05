import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const probe = async (t, { mode = 'ok', signal, failCleanup = false, realPlaywright = false } = {}) => {
  const directory = mkdtempSync(join(tmpdir(), 'villas-runner-test-'));
  const serverPidFile = join(directory, 'server.pid');
  let runner;
  let finished;
  t.after(async () => {
    if (runner && runner.exitCode === null && runner.signalCode === null) {
      runner.kill('SIGTERM');
      await finished;
    }
    if (existsSync(serverPidFile)) {
      try { process.kill(Number(readFileSync(serverPidFile, 'utf8')), 'SIGTERM'); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    rmSync(directory, { recursive: true, force: true });
  });
  for (const path of ['scripts', 'bin', 'dev', 'frontend']) mkdirSync(join(directory, path), { recursive: true });
  for (const file of ['e2e.mjs', 'local-db.mjs', 'dev-db.mjs']) cpSync(join(root, 'scripts', file), join(directory, 'scripts', file));
  writeFileSync(join(directory, 'scripts/run-api.mjs'), 'process.exit(0);');
  cpSync(join(root, 'mariadb-image.txt'), join(directory, 'mariadb-image.txt'));
  cpSync(join(root, 'dev/fixtures.sql'), join(directory, 'dev/fixtures.sql'));
  const dockerLog = join(directory, 'docker.log');
  const ready = join(directory, 'ready');
  writeFileSync(join(directory, 'bin/docker'), `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(process.env.VILLAS_TEST_DOCKER_LOG, JSON.stringify(args) + '\\n');
if (args.includes('port')) console.log('127.0.0.1:33306');
if (args.includes('exec')) console.log('0');
if (args.includes('down') && process.env.VILLAS_TEST_FAIL_CLEANUP === '1') process.exit(1);
`, { mode: 0o755 });
  if (realPlaywright) {
    symlinkSync(join(root, 'frontend/node_modules'), join(directory, 'frontend/node_modules'), 'dir');
    mkdirSync(join(directory, 'frontend/e2e'));
    writeFileSync(join(directory, 'frontend/playwright.config.mjs'), `export default {
  testDir: './e2e', workers: 1, reporter: 'list',
  webServer: { command: 'node server.cjs', gracefulShutdown: { signal: 'SIGTERM', timeout: 1000 } }
};`);
    writeFileSync(join(directory, 'frontend/server.cjs'), `require('node:fs').writeFileSync(process.env.VILLAS_TEST_SERVER_PID, String(process.pid)); setInterval(() => {}, 1000);`);
    writeFileSync(join(directory, 'frontend/e2e/hold.spec.mjs'), `import { test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
test('wait for interruption', async () => { writeFileSync(process.env.VILLAS_TEST_READY, String(process.pid)); await new Promise(() => {}); });`);
  } else {
    mkdirSync(join(directory, 'frontend/node_modules/@playwright/test'), { recursive: true });
    writeFileSync(join(directory, 'frontend/node_modules/@playwright/test/package.json'), '{"type":"module"}');
    writeFileSync(join(directory, 'frontend/node_modules/@playwright/test/cli.js'), `import { writeFileSync } from 'node:fs';
if (process.env.VILLAS_TEST_MODE === 'fail') process.exit(7);
if (process.env.VILLAS_TEST_MODE !== 'wait') process.exit(0);
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
writeFileSync(process.env.VILLAS_TEST_READY, String(process.pid));
setInterval(() => {}, 1000);
`);
  }
  runner = spawn(process.execPath, ['scripts/e2e.mjs'], {
    cwd: directory,
    detached: true,
    env: {
      ...process.env,
      PATH: `${join(directory, 'bin')}:${dirname(process.execPath)}:${process.env.PATH}`,
      VILLAS_TEST_DOCKER_LOG: dockerLog,
      VILLAS_TEST_READY: ready,
      VILLAS_TEST_SERVER_PID: serverPidFile,
      VILLAS_TEST_MODE: signal ? 'wait' : mode,
      VILLAS_TEST_FAIL_CLEANUP: failCleanup ? '1' : '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  runner.stdout.on('data', (chunk) => { output += chunk; });
  runner.stderr.on('data', (chunk) => { output += chunk; });
  finished = new Promise((resolve, reject) => {
    runner.once('error', reject);
    runner.once('close', (code, exitSignal) => resolve({ code, signal: exitSignal }));
  });
  if (signal) {
    const deadline = Date.now() + 10_000;
    while ((!existsSync(ready) || (realPlaywright && !existsSync(serverPidFile))) && runner.exitCode === null && Date.now() < deadline) await delay(10);
    assert.ok(existsSync(ready), `Playwright fixture did not become ready: ${output}`);
    if (signal === 'SIGINT') process.kill(-runner.pid, signal);
    else runner.kill(signal);
  }
  const result = await finished;
  const calls = readFileSync(dockerLog, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(calls.filter((args) => args.includes('down') && args.includes('--volumes')).length, 1, output);
  const states = readdirSync(join(directory, '.local-state'));
  assert.equal(states.length, failCleanup ? 1 : 0, output);
  if (failCleanup) assert.ok(existsSync(join(directory, '.local-state', states[0], 'db.json')));
  if (signal) {
    const childPid = Number(readFileSync(ready, 'utf8'));
    assert.throws(() => process.kill(childPid, 0), { code: 'ESRCH' });
  }
  if (realPlaywright) assert.throws(() => process.kill(Number(readFileSync(serverPidFile, 'utf8')), 0), { code: 'ESRCH' });
  return { ...result, output };
};

test('successful browser checks remove their database and local state', async (t) => {
  assert.equal((await probe(t)).code, 0);
});

test('failed browser checks still remove their database and local state', async (t) => {
  assert.equal((await probe(t, { mode: 'fail' })).code, 1);
});

test('terminal SIGINT stops the child and cleans up once', async (t) => {
  assert.equal((await probe(t, { signal: 'SIGINT' })).code, 130);
});

test('parent SIGTERM stops the child and cleans up once', async (t) => {
  assert.equal((await probe(t, { signal: 'SIGTERM' })).code, 143);
});

test('failed database cleanup retains recovery state and fails the check', async (t) => {
  const result = await probe(t, { failCleanup: true });
  assert.equal(result.code, 1);
  assert.match(result.output, /Local state retained for recovery/);
});

test('SIGTERM also stops the real Playwright CLI detached web server', async (t) => {
  assert.equal((await probe(t, { signal: 'SIGTERM', realPlaywright: true })).code, 143);
});
