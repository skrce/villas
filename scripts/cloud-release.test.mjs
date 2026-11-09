import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireChecksRun, validateChecksRun } from './cloud-release-input.mjs';
import { validateCloudConfig } from './cloud-config.mjs';
import { protectedSnapshotAge } from '../deploy/recovery-policy.mjs';

const source = 'a'.repeat(40);
const run = { repository: { full_name: 'skrce/villas' }, head_repository: { full_name: 'skrce/villas' }, head_sha: source,
  head_branch: 'master', event: 'push', workflow_id: 42, path: '.github/workflows/checks.yml', status: 'completed', conclusion: 'success' };

test('release input requires a successful exact-revision master push from the authoritative workflow', () => {
  validateChecksRun(run, 42, source);
  for (const changed of [{ head_sha: 'b'.repeat(40) }, { head_branch: 'other' }, { event: 'pull_request' }, { workflow_id: 41 }, { path: '.github/workflows/other.yml' }, { status: 'in_progress' }, { conclusion: 'failure' }, { repository: { full_name: 'someone/villas' } }, { head_repository: { full_name: 'someone/villas' } }]) {
    assert.throws(() => validateChecksRun({ ...run, ...changed }, 42, source));
  }
});

test('release input verifies both authoritative workflow ID and selected run; failures never become clearance', async () => {
  const calls = [];
  const env = { VILLAS_CHECKS_RUN_ID: '123', GITHUB_SHA: source, GITHUB_REPOSITORY: 'skrce/villas', GITHUB_REF: 'refs/heads/master', GITHUB_EVENT_NAME: 'workflow_dispatch', GH_TOKEN: 'synthetic-private' };
  const request = async (url, options) => {
    calls.push(url); assert.equal(options.headers.Authorization, 'Bearer synthetic-private');
    return { ok: true, json: async () => url.endsWith('checks.yml') ? { id: 42 } : run };
  };
  await requireChecksRun(env, request);
  assert.equal(calls.length, 2);
  await assert.rejects(() => requireChecksRun(env, async () => ({ ok: false })), /Cannot confirm/);
  await assert.rejects(() => requireChecksRun({ ...env, GITHUB_REF: 'refs/heads/other' }, request));
});

test('operator configuration pins a separate personal account and rejects cross-project credential locations', () => {
  const config = { projectId: 'villas-synthetic-stage', environment: 'staging', account: 'owner@gmail.com', configuration: 'villas-personal', stateBucket: 'villas-synthetic-stage-state', gcloudConfigDir: '/private/operator/gcloud', variablesFile: '/private/operator/staging.tfvars.json', terraformBinary: '/tools/terraform', gcloudBinary: '/tools/gcloud' };
  validateCloudConfig(config, '/repo');
  for (const changed of [{ projectId: 'employer-project' }, { account: 'user@employer.test' }, { configuration: 'default' }, { stateBucket: 'other-project-state' }, { variablesFile: '/repo/private.tfvars.json' }, { gcloudConfigDir: 'relative' }]) assert.throws(() => validateCloudConfig({ ...config, ...changed }, '/repo'));
});

test('cloud backup freshness uses the protected snapshot point and excludes incomplete, foreign, future and malformed snapshots', () => {
  const now = 1_800_000_000_000;
  const snapshot = { id: 'a'.repeat(64), hostname: 'villas-staging-test', paths: ['/villas.dump'], tags: ['villas-complete', `villas-protected-${now - 86_401_000}`] };
  assert.equal(protectedSnapshotAge([snapshot], snapshot.hostname, now), 86401);
  const fresh = { ...snapshot, id: 'b'.repeat(64), tags: ['villas-complete', `villas-protected-${now - 23_000}`] };
  assert.equal(protectedSnapshotAge([snapshot, fresh], snapshot.hostname, now), 23);
  for (const changed of [{ hostname: 'other' }, { paths: ['/other'] }, { id: 'short' }, { tags: [`villas-protected-${now - 1000}`] }, { tags: ['villas-complete'] }, { tags: ['villas-complete', `villas-protected-${now + 1000}`] }, { tags: ['villas-complete', `villas-protected-${now - 1000}`, `villas-protected-${now - 2000}`] }]) assert.throws(() => protectedSnapshotAge([{ ...snapshot, ...changed }], snapshot.hostname, now));
});
