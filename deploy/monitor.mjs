import { randomUUID } from 'node:crypto';
import { readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const metrics = ['villas_auth_failures_total', 'villas_booking_write_failures_total', 'villas_database_failures_total', 'villas_service_failures_total'];
const conditions = new Set(['service_unavailable', 'readiness_failed', 'monitoring_unavailable', 'authentication_failures', 'booking_write_failures', 'database_errors', 'service_errors', 'backup_failed', 'backup_stale']);
const MAX_PENDING_EVENTS = 32;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const envelope = (environment, active, at, coalesced = false) => ({
  id: randomUUID(), app: 'villas', environment, state: active.length ? 'alert' : 'recovered',
  conditions: active, at, ...(coalesced ? { coalesced: true } : {}),
});
export function enqueue(queue, event) {
  const next = [...queue, event];
  if (next.length <= MAX_PENDING_EVENTS) return next;
  const tail = next.slice(1);
  const combined = [...new Set(tail.flatMap(item => item.conditions))].sort();
  const result = [next[0]];
  if (combined.length) result.push(envelope(event.environment, combined, tail[0].at, true));
  if (!combined.length || !same(combined, event.conditions)) result.push(event);
  return result;
}
const validConditions = active => Array.isArray(active) && active.length <= conditions.size && active.every(value => conditions.has(value)) && same(active, [...new Set(active)].sort());
const validEnvelope = event => event && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(event.id) && event.app === 'villas' && ['production', 'staging', 'rehearsal'].includes(event.environment) &&
  validConditions(event.conditions) && event.state === (event.conditions.length ? 'alert' : 'recovered') && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(event.at) && Number.isFinite(Date.parse(event.at)) &&
  Object.keys(event).every(key => ['id', 'app', 'environment', 'state', 'conditions', 'at', 'coalesced'].includes(key)) && (event.coalesced === undefined || event.coalesced === true);
const outbox = (before, environment) => {
  let queue = before.queue ?? [];
  if (!before.queue && before.id && before.delivery !== 'accepted') queue = [{
    id: before.id, app: 'villas', environment: before.environment,
    state: before.conditions?.length ? 'alert' : 'recovered', conditions: before.conditions,
    at: before.eventAt ?? before.checkedAt,
  }];
  if (!Array.isArray(queue) || queue.length > MAX_PENDING_EVENTS || !queue.every(validEnvelope) || queue.some(item => item.environment !== environment)) throw new Error('Invalid pending monitoring events. Preserve the private status for recovery.');
  return queue;
};
export function assess({ live, ready, metricsAvailable = true, current, previous = {}, backup, now, maximumAge }) {
  const active = [];
  if (!live) active.push('service_unavailable');
  if (!ready) active.push('readiness_failed');
  if (!metricsAvailable) active.push('monitoring_unavailable');
  for (const [metric, condition, threshold] of [
    [metrics[0], 'authentication_failures', 5], [metrics[1], 'booking_write_failures', 1],
    [metrics[2], 'database_errors', 1], [metrics[3], 'service_errors', 1],
  ]) {
    const value = current[metric]; const before = previous[metric];
    if (Number.isSafeInteger(value) && Number.isSafeInteger(before) && value - (value >= before ? before : 0) >= threshold) active.push(condition);
  }
  if (backup?.ok !== true) active.push('backup_failed');
  const completed = Date.parse(backup?.completedAt);
  const protectedAt = Date.parse(backup?.protectedAt);
  if (!Number.isFinite(completed) || !Number.isFinite(protectedAt) || completed > now || protectedAt > completed || now - protectedAt > maximumAge * 1000) active.push('backup_stale');
  return active.sort();
}

const privateJson = path => {
  if (!path || !isAbsolute(path)) throw new Error('Invalid private status path.');
  if (!statSync(path).isFile() || statSync(path).size > 131_072) throw new Error('Invalid private status file.');
  return JSON.parse(readFileSync(path, 'utf8'));
};
const probe = async path => {
  try {
    const origin = new URL(process.env.VILLAS_MONITOR_API_ORIGIN ?? 'http://127.0.0.1:9098');
    if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(origin.hostname) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error();
    const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(5_000), redirect: 'error' });
    const text = await response.text();
    return { ok: response.ok && text.length <= 16_384, text };
  } catch { return { ok: false, text: '' }; }
};
const atomicJson = (path, value) => {
  if (!path || !isAbsolute(path)) throw new Error('Invalid private status path.');
  writeFileSync(`${path}.tmp`, `${JSON.stringify(value)}\n`, { mode: 0o600 }); renameSync(`${path}.tmp`, path);
};
export async function check() {
  const env = process.env.VILLAS_DEPLOY_ENVIRONMENT;
  if (!['production', 'staging', 'rehearsal'].includes(env)) throw new Error('Choose an explicit monitoring environment.');
  const maximumAge = Number(process.env.VILLAS_BACKUP_MAX_AGE_SECONDS);
  if (!Number.isSafeInteger(maximumAge) || maximumAge < 60 || maximumAge > 604800) throw new Error('Configure the approved maximum backup age.');
  let before = {}; let backup;
  try { before = privateJson(process.env.VILLAS_MONITOR_STATUS_FILE); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('Cannot read pending monitoring events. Preserve the private status for recovery.'); }
  let queue = [...outbox(before, env)];
  try { backup = privateJson(process.env.VILLAS_BACKUP_STATUS_FILE); } catch { /* An unreadable status is an unavailable backup signal. */ }
  const [live, ready, measured] = await Promise.all([probe('/internal/health/live'), probe('/internal/health/ready'), probe('/internal/metrics')]);
  const current = {};
  for (const line of measured.text.split('\n')) {
    const [key, value] = line.split(' ');
    if (metrics.includes(key) && /^[0-9]+$/.test(value)) current[key] = Number(value);
  }
  const active = assess({ live: live.ok, ready: ready.ok, metricsAvailable: measured.ok && metrics.every(key => Number.isSafeInteger(current[key])), current, previous: before.counters, backup, now: Date.now(), maximumAge });
  const changed = !same(active, before.observed ?? before.conditions ?? []);
  const checkedAt = new Date().toISOString();
  if (changed) queue = enqueue(queue, envelope(env, active, checkedAt));
  let delivery = queue.length ? 'unconfigured' : (before.delivery ?? 'idle');
  const state = { version: 2, environment: env, observed: active, queue, counters: current, delivery, checkedAt, lastAccepted: before.lastAccepted ?? null };
  // Persist the entire pending envelope before contacting a receiver whose response may be lost.
  atomicJson(process.env.VILLAS_MONITOR_STATUS_FILE, state);
  if (queue.length && process.env.VILLAS_ALERT_URL_FILE) {
    const pending = queue[0];
    let url;
    try {
      url = new URL(readFileSync(process.env.VILLAS_ALERT_URL_FILE, 'utf8').trim());
      const local = process.env.VILLAS_ALERT_LOCAL_REHEARSAL === '1' && /^e2e-[a-f0-9]{12}$/.test(process.env.VILLAS_LOCAL_INSTANCE ?? '') && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
      if ((!local && url.protocol !== 'https:') || url.username || url.password || url.hash) throw new Error();
      const response = await fetch(url, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5_000),
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': pending.id },
        body: JSON.stringify(pending),
      });
      if (response.ok) {
        state.lastAccepted = pending;
        queue.shift();
        delivery = queue.length ? 'pending' : 'accepted';
      } else delivery = 'unconfirmed';
      try { await response.body?.cancel(); } catch { /* Body cleanup cannot invalidate an observed HTTP acceptance. */ }
    } catch { delivery = 'unconfirmed'; }
    atomicJson(process.env.VILLAS_MONITOR_STATUS_FILE, { ...state, delivery });
  }
  if (changed || delivery !== before.delivery || queue.length !== before.queue?.length) console.log(`villas_monitor state=${active.length ? 'alert' : 'healthy'} delivery=${delivery} pending=${queue.length}`);
  return { active, delivery, pending: queue.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let stopped = false;
  let wake;
  const stop = () => { stopped = true; wake?.(); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  try {
    if (!['once', 'watch'].includes(process.argv[2])) throw new Error('Use the monitor with once or watch.');
    do {
      await check();
      if (process.argv[2] === 'once' || stopped) break;
      await new Promise(resolve => {
        const timer = setTimeout(resolve, 60_000);
        wake = () => { clearTimeout(timer); resolve(); };
      });
    } while (!stopped);
  } catch {
    console.error('villas_monitor_failed'); process.exitCode = 1;
  }
}
