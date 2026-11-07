import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assess, check } from '../deploy/monitor.mjs';

const now = Date.now();
const fresh = { ok: true, completedAt: new Date(now - 1000).toISOString() };
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
    writeFileSync(join(state, 'backup.json'), JSON.stringify({ ok: true, completedAt: new Date().toISOString() }));
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
