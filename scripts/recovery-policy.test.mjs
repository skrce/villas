import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { backupDelay, maximumBackupAge, maximumBackupJob, RECOVERY_TARGETS } from '../deploy/recovery-policy.mjs';

test('daily protection reserves both runs inside the approved 24-hour loss target', () => {
  const delay = backupDelay({});
  const runtime = maximumBackupJob({});
  const nextCompletion = runtime + delay + runtime;
  assert.equal(maximumBackupAge({}), 86400);
  assert.equal(RECOVERY_TARGETS.recoveryTimeTargetSeconds, 86400);
  assert(nextCompletion <= maximumBackupAge({}));
  assert(delay > 22 * 3600);
  assert(!('retentionDays' in RECOVERY_TARGETS));
});

test('a full-day delay or longer job budget cannot silently exceed the target', () => {
  assert.throws(() => backupDelay({ VILLAS_BACKUP_INTERVAL_SECONDS: '86400' }), /leave time for both backup jobs/);
  assert.throws(() => backupDelay({ VILLAS_BACKUP_MAX_JOB_SECONDS: '3600' }), /leave time for both backup jobs/);
  assert.equal(backupDelay({ VILLAS_BACKUP_INTERVAL_SECONDS: '79200', VILLAS_BACKUP_MAX_JOB_SECONDS: '3600' }), 79200);
  const result = spawnSync(process.execPath, ['deploy/backup.mjs', 'schedule'], {
    env: { PATH: process.env.PATH, VILLAS_BACKUP_INTERVAL_SECONDS: '86400' }, encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /recovery-policy/);
});

test('blank Compose settings use the approved policy while malformed overrides fail closed', () => {
  assert.equal(backupDelay({ VILLAS_BACKUP_INTERVAL_SECONDS: '', VILLAS_BACKUP_MAX_JOB_SECONDS: '', VILLAS_BACKUP_MAX_AGE_SECONDS: '' }), backupDelay({}));
  for (const value of ['0', '-1', '1.5', 'invalid', '999999999999999999']) {
    assert.throws(() => maximumBackupAge({ VILLAS_BACKUP_MAX_AGE_SECONDS: value }));
    assert.throws(() => maximumBackupJob({ VILLAS_BACKUP_MAX_JOB_SECONDS: value }));
    assert.throws(() => backupDelay({ VILLAS_BACKUP_INTERVAL_SECONDS: value }));
  }
});
