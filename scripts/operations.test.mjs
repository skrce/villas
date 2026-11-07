import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { assess, check, enqueue } from '../deploy/monitor.mjs';

const now = Date.now();
const fresh = { ok: true, completedAt: new Date(now - 1000).toISOString(), protectedAt: new Date(now - 2000).toISOString() };
const base = { live: true, ready: true, current: {}, backup: fresh, now, maximumAge: 3600 };
test('fresh backups and healthy probes have no alert', () => assert.deepEqual(assess(base), []));
test('unavailable probes, missing backup and malformed metrics remain distinct', () => {
  assert.deepEqual(assess({ ...base, live: false, ready: false, metricsAvailable: false, backup: undefined }), ['backup_failed', 'backup_stale', 'monitoring_unavailable', 'readiness_failed', 'service_unavailable']);
});
test('only new fixed-category failures trigger thresholds and reset counters are tolerated', () => {
  const current = { villas_auth_failures_total: 5, villas_booking_write_failures_total: 1, villas_database_failures_total: 1, villas_service_failures_total: 1 };
  const previous = Object.fromEntries(Object.keys(current).map(key => [key, 0]));
  assert.deepEqual(assess({ ...base, current, previous }), ['authentication_failures', 'booking_write_failures', 'database_errors', 'service_errors']);
  assert.deepEqual(assess({ ...base, current: previous, previous: current }), []);
  assert.deepEqual(assess({ ...base, backup: { ...fresh, completedAt: new Date(now + 1000).toISOString() } }), ['backup_stale']);
  assert.deepEqual(assess({ ...base, backup: { ...fresh, protectedAt: new Date(now - 3_600_001).toISOString() } }), ['backup_stale']);
  assert.deepEqual(assess({ ...base, backup: { ...fresh, protectedAt: undefined } }), ['backup_stale']);
});

test('local alert delivery is private, quiet when unchanged, and reports recovery', async () => {
  const state = mkdtempSync(join(tmpdir(), 'villas-alert-test-'));
  const original = { ...process.env };
  const messages = [];
  let fail = true;
  const server = createServer(async (request, response) => {
    if (request.url === '/alerts') {
      let body = ''; for await (const chunk of request) body += chunk;
      messages.push({ id: request.headers['idempotency-key'], body: JSON.parse(body) });
      response.writeHead(fail ? 503 : 202); response.end('private diagnostic must not be logged'); return;
    }
    response.writeHead(200);
    response.end(request.url === '/internal/metrics' ? ['villas_auth_failures_total', 'villas_booking_write_failures_total', 'villas_database_failures_total', 'villas_service_failures_total'].map(key => `${key} 0`).join('\n') : 'UP');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    writeFileSync(join(state, 'alert'), `${origin}/alerts`, { mode: 0o600 });
    writeFileSync(join(state, 'backup.json'), JSON.stringify({ ok: false }), { mode: 0o600 });
    Object.assign(process.env, { VILLAS_MONITOR_API_ORIGIN: origin, VILLAS_DEPLOY_ENVIRONMENT: 'rehearsal', VILLAS_BACKUP_MAX_AGE_SECONDS: '3600', VILLAS_BACKUP_STATUS_FILE: join(state, 'backup.json'), VILLAS_MONITOR_STATUS_FILE: join(state, 'monitor.json'), VILLAS_ALERT_URL_FILE: join(state, 'alert'), VILLAS_ALERT_LOCAL_REHEARSAL: '1', VILLAS_LOCAL_INSTANCE: 'e2e-0123456789ab' });
    assert.equal((await check()).delivery, 'unconfirmed');
    fail = false;
    assert.equal((await check()).delivery, 'accepted');
    assert.equal(messages.length, 2); assert.equal(messages[0].id, messages[1].id);
    assert.deepEqual(messages[0].body, messages[1].body);
    await check(); assert.equal(messages.length, 2);
    writeFileSync(join(state, 'backup.json'), JSON.stringify({ ok: true, completedAt: new Date().toISOString(), protectedAt: new Date(Date.now() - 1000).toISOString() }));
    await check(); assert.equal(messages.length, 3); assert.equal(messages[2].body.state, 'recovered');
    assert.deepEqual(Object.keys(messages[0].body).sort(), ['app', 'at', 'conditions', 'environment', 'id', 'state']);
    assert(!JSON.stringify(messages).includes('private diagnostic'));
    assert.equal(JSON.parse(readFileSync(join(state, 'monitor.json'), 'utf8')).delivery, 'accepted');
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
    Object.assign(process.env, original);
    await new Promise(resolve => server.close(resolve)); rmSync(state, { recursive: true, force: true });
  }
});

test('an unconfirmed transient failure is delivered before its queued recovery', async () => {
  const state = mkdtempSync(join(tmpdir(), 'villas-alert-transition-'));
  const original = { ...process.env };
  let count = 0;
  const messages = [];
  const server = createServer(async (request, response) => {
    if (request.url === '/alerts') {
      let body = ''; for await (const part of request) body += part;
      messages.push(JSON.parse(body));
      response.writeHead(messages.length === 1 ? 503 : 202); response.end(); return;
    }
    response.writeHead(200);
    response.end(request.url === '/internal/metrics' ? [
      'villas_auth_failures_total 0', `villas_booking_write_failures_total ${count}`,
      'villas_database_failures_total 0', 'villas_service_failures_total 0',
    ].join('\n') : 'UP');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    writeFileSync(join(state, 'alert'), `${origin}/alerts`, { mode: 0o600 });
    writeFileSync(join(state, 'backup.json'), JSON.stringify({ ok: true, completedAt: new Date().toISOString(), protectedAt: new Date(Date.now() - 1000).toISOString() }), { mode: 0o600 });
    Object.assign(process.env, { VILLAS_MONITOR_API_ORIGIN: origin, VILLAS_DEPLOY_ENVIRONMENT: 'rehearsal', VILLAS_BACKUP_MAX_AGE_SECONDS: '3600', VILLAS_BACKUP_STATUS_FILE: join(state, 'backup.json'), VILLAS_MONITOR_STATUS_FILE: join(state, 'monitor.json'), VILLAS_ALERT_URL_FILE: join(state, 'alert'), VILLAS_ALERT_LOCAL_REHEARSAL: '1', VILLAS_LOCAL_INSTANCE: 'e2e-0123456789ab' });
    await check(); assert.equal(messages.length, 0);
    count = 1;
    assert.equal((await check()).delivery, 'unconfirmed');
    const pending = JSON.parse(readFileSync(join(state, 'monitor.json'))).queue[0];
    assert.deepEqual(pending.conditions, ['booking_write_failures']);
    const retried = await check();
    assert.equal(retried.delivery, 'pending'); assert.equal(retried.pending, 1);
    assert.deepEqual(messages[0], messages[1]);
    assert.equal(JSON.parse(readFileSync(join(state, 'monitor.json'))).queue[0].state, 'recovered');
    assert.equal((await check()).delivery, 'accepted');
    assert.equal(messages.length, 3); assert.equal(messages[2].state, 'recovered');
    assert.notEqual(messages[2].id, messages[0].id);
    await check(); assert.equal(messages.length, 3);
    writeFileSync(join(state, 'monitor.json'), '{corrupt');
    await assert.rejects(check, /Cannot read pending monitoring events/);
    assert.equal(readFileSync(join(state, 'monitor.json'), 'utf8'), '{corrupt');
    assert.equal(messages.length, 3);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
    Object.assign(process.env, original);
    await new Promise(resolve => server.close(resolve)); rmSync(state, { recursive: true, force: true });
  }
});

test('a long receiver outage retains the first envelope and bounds later transitions without losing failure categories', () => {
  const kinds = ['authentication_failures', 'booking_write_failures', 'database_errors', 'service_errors', 'backup_failed'];
  const event = active => ({ id: randomUUID(), app: 'villas', environment: 'rehearsal', state: active.length ? 'alert' : 'recovered', conditions: active, at: new Date().toISOString() });
  const first = event(['backup_stale']);
  let queue = [first];
  for (let index = 0; index < 150; index++) {
    queue = enqueue(queue, event(index % 2 ? [] : [kinds[index % kinds.length]]));
    assert(queue.length <= 32); assert.deepEqual(queue[0], first);
  }
  const seen = new Set(queue.flatMap(item => item.conditions));
  for (const kind of kinds) assert(seen.has(kind));
  assert(queue.some(item => item.coalesced));
  assert.equal(queue.at(-1).state, 'recovered');
});
