const DAY_SECONDS = 24 * 60 * 60;
const JOB_SECONDS = 30 * 60;

export const RECOVERY_TARGETS = Object.freeze({
  maximumSnapshotAgeSeconds: DAY_SECONDS,
  recoveryTimeTargetSeconds: DAY_SECONDS,
  maximumJobSeconds: JOB_SECONDS,
  backupDelaySeconds: DAY_SECONDS - 2 * JOB_SECONDS,
});

const configured = (environment, name, fallback, minimum, maximum) => {
  const value = environment[name];
  if (value === undefined || value === '') return fallback;
  if (!/^(0|[1-9][0-9]*)$/.test(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error(`Villas backup operation failed at ${name}.`);
  }
  return Number(value);
};

export const maximumBackupAge = (environment = process.env) => configured(environment,
  'VILLAS_BACKUP_MAX_AGE_SECONDS', RECOVERY_TARGETS.maximumSnapshotAgeSeconds, 60, 604800);

export const maximumBackupJob = (environment = process.env) => configured(environment,
  'VILLAS_BACKUP_MAX_JOB_SECONDS', RECOVERY_TARGETS.maximumJobSeconds, 60, 3600);

export function backupDelay(environment = process.env) {
  const delay = configured(environment, 'VILLAS_BACKUP_INTERVAL_SECONDS', RECOVERY_TARGETS.backupDelaySeconds, 60, 86400);
  // Fixed delay follows completion, so reserve the current and next job's runtime.
  if (delay + 2 * maximumBackupJob(environment) > maximumBackupAge(environment)) {
    throw new Error('Villas backup operation failed at recovery-policy: leave time for both backup jobs within the snapshot-age target.');
  }
  return delay;
}
