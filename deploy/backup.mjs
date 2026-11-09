import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { backupDelay, maximumBackupJob, maximumBackupAge, protectedSnapshotAge } from './recovery-policy.mjs';

const stageError = stage => new Error(`Villas backup operation failed at ${stage}. Inspect the private environment and repository; the target must remain quarantined after a restore failure.`);
const privateLine = name => {
  try {
    const path = process.env[name];
    if (!path || !isAbsolute(path) || !statSync(path).isFile() || statSync(path).size > 16_384) throw new Error();
    const value = readFileSync(path, 'utf8').replace(/[\r\n]+$/, '');
    if (!value.trim() || value.length > 16_384 || /[\r\n\0]/.test(value)) throw new Error();
    return value;
  } catch { throw stageError(name); }
};
const boundedInteger = (name, minimum, maximum) => {
  const value = process.env[name];
  if (!/^(0|[1-9][0-9]*)$/.test(value ?? '') || Number(value) < minimum || Number(value) > maximum) throw stageError(name);
  return Number(value);
};
const children = new Set();
const cancel = child => { child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 2_000).unref(); };
let stopped = false;
const stop = () => {
  stopped = true;
  for (const child of children) cancel(child);
};
process.on('SIGTERM', stop); process.on('SIGINT', stop);

const sqlEnvironment = () => ({ PATH: process.env.PATH, TZ: 'UTC', PGPASSWORD: privateLine('VILLAS_BACKUP_DB_PASSWORD_FILE'), PGSSLMODE: process.env.VILLAS_CLOUD_RUN === '1' ? 'verify-full' : (process.env.VILLAS_BACKUP_DB_SSLMODE ?? 'verify-full'), PGSSLROOTCERT: '/etc/ssl/certs/ca-certificates.crt', PGCONNECT_TIMEOUT: '15' });
const sqlArguments = () => {
  const host = process.env.VILLAS_BACKUP_DB_HOST;
  if (!/^[a-z0-9][a-z0-9.-]{0,252}$/.test(host ?? '')) throw stageError('database-host');
  if (process.env.VILLAS_CLOUD_RUN === '1' && (!/^ep-[a-z0-9-]+(?:\.c-[0-9]+)?\.eu-central-1\.aws\.neon\.tech$/.test(host) || host.includes('-pooler'))) throw stageError('database-host');
  return [`--host=${host}`, '--port=5432', '--username=' + (process.argv[2] === 'restore' ? 'villas_migration' : 'villas_backup')];
};
const resticEnvironment = () => {
  if (process.env.VILLAS_BACKUP_REPOSITORY && process.env.VILLAS_BACKUP_REPOSITORY_FILE) throw stageError('repository-source');
  const repository = process.env.VILLAS_BACKUP_REPOSITORY ?? privateLine('VILLAS_BACKUP_REPOSITORY_FILE');
  const local = process.env.VILLAS_BACKUP_LOCAL_REHEARSAL === '1' && /^e2e-[a-f0-9]{12}$/.test(process.env.VILLAS_LOCAL_INSTANCE ?? '');
  const gcs = /^gs:[a-z0-9][a-z0-9-]{2,61}[a-z0-9]:\/[a-z0-9/-]+$/.test(repository);
  if (isAbsolute(repository)) {
    if (!local) throw stageError('local-repository-is-rehearsal-only');
  } else if (!gcs) {
    let url;
    try { url = new URL(repository.replace(/^s3:/, '')); } catch { throw stageError('repository'); }
    if (!repository.startsWith('s3:') || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw stageError('repository');
  }
  if (process.env.VILLAS_CLOUD_RUN === '1' && !gcs) throw stageError('cloud-repository');
  const env = { PATH: process.env.PATH, TZ: 'UTC', RESTIC_REPOSITORY: repository, RESTIC_PASSWORD: privateLine('VILLAS_BACKUP_PASSWORD_FILE'), RESTIC_CACHE_DIR: '/tmp/restic-cache' };
  if (gcs) {
    const project = process.env.VILLAS_GOOGLE_PROJECT_ID;
    if (process.env.VILLAS_CLOUD_RUN !== '1' || process.env.VILLAS_BACKUP_CREDENTIALS_FILE || !/^villas-[a-z0-9-]{1,23}[a-z0-9]$/.test(project ?? '')) throw stageError('cloud-repository-identity');
    env.GOOGLE_PROJECT_ID = project;
  }
  if (process.env.VILLAS_BACKUP_CREDENTIALS_FILE) {
    let credentials;
    try {
      const path = process.env.VILLAS_BACKUP_CREDENTIALS_FILE;
      if (!isAbsolute(path) || !statSync(path).isFile() || statSync(path).size > 16_384) throw new Error();
      credentials = JSON.parse(readFileSync(path, 'utf8'));
      if (!credentials || Array.isArray(credentials) || typeof credentials !== 'object') throw new Error();
    } catch { throw stageError('repository-credentials'); }
    const allowed = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AWS_DEFAULT_REGION'];
    if (Object.keys(credentials).some(key => !allowed.includes(key))) throw stageError('repository-credentials');
    for (const [key, value] of Object.entries(credentials)) {
      if (typeof value !== 'string' || !value || value.length > 16_384 || /[\r\n\0]/.test(value)) throw stageError('repository-credentials');
      env[key] = value;
    }
  }
  return env;
};
const start = (command, args, env, { capture = false, input, pipe = false } = {}) => {
  if (stopped) throw stageError('interrupted');
  const child = spawn(command, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
  children.add(child);
  let output = '';
  if (capture) child.stdout.on('data', chunk => { output += chunk; if (output.length > 4_194_304) child.kill('SIGTERM'); });
  else if (!pipe) child.stdout.resume();
  child.stderr.resume();
  const seconds = process.env.VILLAS_BACKUP_COMMAND_TIMEOUT_SECONDS === undefined ? 900 : boundedInteger('VILLAS_BACKUP_COMMAND_TIMEOUT_SECONDS', 5, 86400);
  const timeout = setTimeout(() => cancel(child), seconds * 1000);
  const done = new Promise(resolve => {
    child.once('error', () => { clearTimeout(timeout); resolve({ code: 1, output: '' }); });
    child.once('close', code => { clearTimeout(timeout); children.delete(child); resolve({ code: stopped ? 1 : code, output }); });
  });
  if (!pipe) child.stdin.end(input);
  return { child, done };
};
const transfer = async (source, destination, { catalogue = false } = {}) => {
  destination.child.once('error', () => cancel(source.child));
  destination.child.once('close', code => {
    if (catalogue && code === 0) {
      source.child.stdout.unpipe(destination.child.stdin);
      source.child.stdout.resume();
      return;
    }
    if (!source.child.stdout.readableEnded) cancel(source.child);
    else setTimeout(() => { if (children.has(source.child)) cancel(source.child); }, 2_000).unref();
  });
  source.child.once('error', () => cancel(destination.child));
  source.child.once('close', code => { if (code !== 0) cancel(destination.child); });
  source.child.stdout.once('error', () => { cancel(source.child); cancel(destination.child); });
  destination.child.stdin.once('error', () => {
    if (catalogue) {
      source.child.stdout.unpipe(destination.child.stdin);
      source.child.stdout.resume();
    } else { cancel(source.child); cancel(destination.child); }
  });
  source.child.stdout.pipe(destination.child.stdin);
  return Promise.all([source.done, destination.done]);
};
const checked = async (command, args, env, stage, options) => {
  const result = await start(command, args, env, options).done;
  if (result.code !== 0) throw stageError(stage);
  return result.output;
};
const resticArguments = args => {
  const readOnly = process.env.VILLAS_BACKUP_READ_ONLY === '1';
  if (readOnly && !['check', 'snapshots', 'dump'].includes(args[0])) throw stageError('read-only-repository');
  return readOnly ? ['--no-lock', ...args] : args;
};
const restic = (args, stage, capture = false) => checked('restic', resticArguments(args), resticEnvironment(), stage, { capture });
const sql = (statement, stage) => checked('psql', [...sqlArguments(), '--no-psqlrc', '--quiet', '--tuples-only', '--no-align', '--set=ON_ERROR_STOP=1', '--dbname=villarosa'], sqlEnvironment(), stage, { capture: true, input: statement });
const host = () => {
  const name = process.env.VILLAS_BACKUP_HOST;
  if (!/^villas-(staging|production|rehearsal)-[a-z0-9-]{1,48}$/.test(name ?? '')) throw stageError('backup-host');
  return name;
};
const status = (ok, stage, protectedAt) => {
  const path = process.env.VILLAS_BACKUP_STATUS_FILE;
  if (!path || !isAbsolute(path)) throw stageError('status-file');
  let previous = {};
  try { previous = JSON.parse(readFileSync(path, 'utf8')); } catch { /* No successful run exists before the first backup. */ }
  const now = new Date().toISOString();
  const result = {
    ok, stage, checkedAt: now, completedAt: ok ? now : (previous.completedAt ?? null),
    protectedAt: ok ? new Date(protectedAt).toISOString() : (previous.protectedAt ?? null),
  };
  writeFileSync(`${path}.tmp`, `${JSON.stringify(result)}\n`, { mode: 0o600 });
  renameSync(`${path}.tmp`, path);
};
const jobSeconds = () => maximumBackupJob();
const pendingPattern = /^villas-pending-([0-9]{13})-([0-9]{13})-[a-f0-9]{24}$/;
const discardPending = async tag => {
  let snapshots;
  try {
    const args = ['snapshots', '--json', '--host', host(), '--path', '/villas.dump'];
    if (tag) args.push('--tag', tag);
    snapshots = JSON.parse(await restic(args, 'pending-inspection', true));
  } catch { throw stageError('pending-inspection'); }
  const ids = [];
  for (const snapshot of snapshots) {
    if (snapshot.hostname !== host() || !snapshot.paths?.includes('/villas.dump') || !/^[a-f0-9]{64}$/.test(snapshot.id ?? '') || !Array.isArray(snapshot.tags) || snapshot.tags.includes('villas-complete')) continue;
    const eligible = snapshot.tags.some(value => {
      const match = pendingPattern.exec(value);
      if (!match) return false;
      const started = Number(match[1]); const expires = Number(match[2]);
      return expires > started && expires - started <= 3_600_000 && (tag ? value === tag : Date.now() > expires + 120_000);
    });
    if (eligible) ids.push(snapshot.id);
  }
  if (ids.length) await restic(['forget', ...ids, '--prune'], 'pending-cleanup');
};
const backup = async () => {
  const hourly = process.env.VILLAS_KEEP_HOURLY ? boundedInteger('VILLAS_KEEP_HOURLY', 0, 8760) : 0;
  const daily = boundedInteger('VILLAS_KEEP_DAILY', 0, 3650);
  if (hourly + daily === 0) throw stageError('retention');
  await discardPending();
  const started = Date.now();
  const tag = `villas-pending-${started}-${started + jobSeconds() * 1000}-${randomBytes(12).toString('hex')}`;
  const dump = start('pg_dump', [...sqlArguments(), '--format=custom', '--compress=6', '--no-owner', '--no-acl', '--schema=public', '--dbname=villarosa'], sqlEnvironment(), { pipe: true });
  dump.child.stdin.end();
  const archive = start('restic', ['backup', '--stdin', '--stdin-filename', '/villas.dump', '--host', host(), '--tag', tag, '--json'], resticEnvironment(), { capture: true, pipe: true });
  const [dumpResult, result] = await transfer(dump, archive);
  if (dumpResult.code !== 0 || result.code !== 0) {
    try { await discardPending(tag); } catch { /* A later run rechecks expired pending snapshots; none are restore-eligible. */ }
    throw stageError('database-dump');
  }
  let id;
  try { id = result.output.trim().split('\n').map(line => JSON.parse(line)).find(line => line.message_type === 'summary')?.snapshot_id; } catch { throw stageError('backup-summary'); }
  if (!/^[a-f0-9]{64}$/.test(id ?? '')) throw stageError('backup-summary');
  await restic(['tag', '--remove', tag, '--add', 'villas-complete', '--add', `villas-protected-${started}`, id], 'snapshot-commit');
  await restic(['forget', '--host', host(), '--path', '/villas.dump', '--tag', 'villas-complete', '--group-by', 'host,paths', '--keep-hourly', String(hourly), '--keep-daily', String(daily), '--prune'], 'retention');
  status(true, 'complete', started);
  console.log('villas_backup_complete');
};
const runBackup = async () => {
  const deadline = setTimeout(stop, jobSeconds() * 1000);
  try { await backup(); } finally { clearTimeout(deadline); }
};
const restore = async id => {
  if (!/^[a-f0-9]{64}$/.test(id ?? '')) throw stageError('snapshot-id');
  let snapshots;
  try { snapshots = JSON.parse(await restic(['snapshots', '--json', '--host', host(), '--tag', 'villas-complete', id], 'snapshot-selection', true)); } catch { throw stageError('snapshot-selection'); }
  if (snapshots.length !== 1 || snapshots[0].id !== id || !snapshots[0].tags?.includes('villas-complete')) throw stageError('snapshot-selection');
  if ((await sql("SELECT (SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f'))+(SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public');", 'empty-target')).trim() !== '0') throw stageError('target-is-not-empty');
  const metadataSource = start('restic', resticArguments(['dump', id, '/villas.dump']), resticEnvironment(), { pipe: true }); metadataSource.child.stdin.end();
  const metadata = start('pg_restore', ['--list'], { PATH: process.env.PATH, TZ: 'UTC' }, { capture: true, pipe: true });
  const listed = await transfer(metadataSource, metadata, { catalogue: true });
  if (listed.some(result => result.code !== 0)) throw stageError('restore-catalogue');
  const directory = mkdtempSync(join(tmpdir(), 'villas-restore-'));
  try {
    const catalogue = join(directory, 'catalogue');
    // Keep the provisioned public schema and its least-privilege grants.
    const entries = listed[1].output.split('\n').filter(line => !/^\d+; \d+ \d+ SCHEMA - public /.test(line));
    if (!entries.some(line => /^\d+;/.test(line))) throw stageError('restore-catalogue');
    writeFileSync(catalogue, entries.join('\n'), { mode: 0o600 });
    const dump = start('restic', resticArguments(['dump', id, '/villas.dump']), resticEnvironment(), { pipe: true }); dump.child.stdin.end();
    const database = start('pg_restore', [...sqlArguments(), '--no-owner', '--no-acl', '--single-transaction', '--exit-on-error', `--use-list=${catalogue}`, '--dbname=villarosa'], sqlEnvironment(), { pipe: true }); database.child.stdout.resume();
    const results = await transfer(dump, database);
    if (results.some(result => result.code !== 0)) throw stageError('restore-stream');
  } finally { rmSync(directory, { recursive: true, force: true }); }
  const quarantine = readFileSync(fileURLToPath(new URL('./recovery-quarantine.sql', import.meta.url)), 'utf8').replace('__SNAPSHOT_ID__', id);
  await sql(quarantine, 'session-quarantine');
  console.log('villas_restore_quarantined');
};

try {
  const command = process.argv[2];
  if (process.env.VILLAS_BACKUP_READ_ONLY === '1' && !['verify', 'check-age', 'snapshots', 'restore'].includes(command)) throw stageError('read-only-repository');
  if (command === 'init') await restic(['init'], 'repository-init');
  else if (command === 'verify') await restic(['check', '--read-data'], 'repository-check');
  else if (command === 'check-age') {
    const snapshots = JSON.parse(await restic(['snapshots', '--json', '--host', host(), '--tag', 'villas-complete'], 'snapshot-age', true));
    const age = protectedSnapshotAge(snapshots, host());
    if (age > maximumBackupAge()) throw stageError('snapshot-too-old');
    console.log('villas_backup_fresh');
  }
  else if (command === 'snapshots') console.log(await restic(['snapshots', '--json', '--host', host(), '--tag', 'villas-complete'], 'snapshots', true));
  else if (command === 'restore' && process.argv.length === 4) await restore(process.argv[3]);
  else if (command === 'backup') await runBackup();
  else if (command === 'schedule') {
    const interval = backupDelay() * 1000;
    while (!stopped) {
      try { await runBackup(); } catch { status(false, 'backup-failed'); console.error('villas_backup_failed'); }
      if (!stopped) await new Promise(resolve => {
        const timer = setTimeout(() => finish(), interval);
        const finish = () => { clearTimeout(timer); process.off('SIGTERM', finish); process.off('SIGINT', finish); resolve(); };
        process.once('SIGTERM', finish); process.once('SIGINT', finish);
      });
    }
  } else throw stageError('command');
} catch (error) {
  try { if (['backup', 'schedule'].includes(process.argv[2])) status(false, 'backup-failed'); } catch { /* Failure to persist status must not become a success. */ }
  console.error(error.message.startsWith('Villas backup operation failed') ? error.message : 'Villas backup operation failed. The target remains quarantined after a restore failure.');
  process.exitCode = 1;
} finally { stop(); }
