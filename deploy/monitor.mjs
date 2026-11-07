import { randomUUID } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const metrics = ['villas_auth_failures_total', 'villas_booking_write_failures_total', 'villas_database_failures_total', 'villas_service_failures_total'];
const conditions = new Set(['service_unavailable', 'readiness_failed', 'monitoring_unavailable', 'authentication_failures', 'booking_write_failures', 'database_errors', 'service_errors', 'backup_failed', 'backup_stale']);
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
  if (!Number.isFinite(completed) || completed > now || now - completed > maximumAge * 1000) active.push('backup_stale');
  return active.sort();
}

const privateJson = path => {
  if (!path || !isAbsolute(path)) throw new Error('Invalid private status path.');
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
  try { before = privateJson(process.env.VILLAS_MONITOR_STATUS_FILE); } catch { /* First probe has no previous counters. */ }
  try { backup = privateJson(process.env.VILLAS_BACKUP_STATUS_FILE); } catch { /* An unreadable status is an unavailable backup signal. */ }
  const [live, ready, measured] = await Promise.all([probe('/internal/health/live'), probe('/internal/health/ready'), probe('/internal/metrics')]);
  const current = {};
  for (const line of measured.text.split('\n')) {
    const [key, value] = line.split(' ');
    if (metrics.includes(key) && /^[0-9]+$/.test(value)) current[key] = Number(value);
  }
  const active = assess({ live: live.ok, ready: ready.ok, metricsAvailable: measured.ok && metrics.every(key => Number.isSafeInteger(current[key])), current, previous: before.counters, backup, now: Date.now(), maximumAge });
  const changed = JSON.stringify(active) !== JSON.stringify(before.conditions ?? []) || (before.environment && before.environment !== env);
  const announce = changed || (before.delivery !== 'accepted' && (active.length || before.id));
  const id = changed || !before.id ? randomUUID() : before.id;
  let delivery = announce ? 'unconfigured' : (before.delivery ?? 'accepted');
  // Save the event identity before delivery so an uncertain response can be retried with the same ID.
  const checkedAt = new Date().toISOString();
  const eventAt = changed || !before.id ? checkedAt : (before.eventAt ?? checkedAt);
  const state = { id, environment: env, eventAt, conditions: active, counters: current, delivery, checkedAt };
  atomicJson(process.env.VILLAS_MONITOR_STATUS_FILE, state);
  if (announce && process.env.VILLAS_ALERT_URL_FILE) {
    let url;
    try {
      url = new URL(readFileSync(process.env.VILLAS_ALERT_URL_FILE, 'utf8').trim());
      const local = process.env.VILLAS_ALERT_LOCAL_REHEARSAL === '1' && /^e2e-[a-f0-9]{12}$/.test(process.env.VILLAS_LOCAL_INSTANCE ?? '') && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
      if ((!local && url.protocol !== 'https:') || url.username || url.password || url.hash) throw new Error();
      const response = await fetch(url, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5_000),
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': id },
        body: JSON.stringify({ id, app: 'villas', environment: env, state: active.length ? 'alert' : 'recovered', conditions: active.filter(value => conditions.has(value)), at: eventAt }),
      });
      delivery = response.ok ? 'accepted' : 'unconfirmed';
      await response.body?.cancel();
    } catch { delivery = 'unconfirmed'; }
    atomicJson(process.env.VILLAS_MONITOR_STATUS_FILE, { ...state, delivery });
  }
  if (changed || delivery !== before.delivery) console.log(`villas_monitor state=${active.length ? 'alert' : 'healthy'} delivery=${delivery}`);
  return { active, delivery };
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
