import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = () => {
  const directory = mkdtempSync(join(tmpdir(), 'villas-operator-test-'));
  const checkout = join(directory, 'checkout'); const operator = join(directory, 'operator');
  mkdirSync(join(checkout, 'scripts'), { recursive: true }); mkdirSync(operator);
  mkdirSync(join(checkout, 'deploy/cloud'), { recursive: true });
  const source = join(checkout, 'deploy/cloud/main.tf'); writeFileSync(source, 'variable "fixture" {}');
  const architecture = join(checkout, 'deploy/cloud/architecture.json');
  writeFileSync(architecture, JSON.stringify({ target: 'shared-app-shared-database', implementation: 'ready' }));
  for (const name of ['cloud-config.mjs', 'cloud-terraform.mjs', 'release-artifacts.mjs']) cpSync(join(root, 'scripts', name), join(checkout, 'scripts', name));
  cpSync(join(root, 'terraform-version.txt'), join(checkout, 'terraform-version.txt'));
  const calls = join(operator, 'calls'); const token = 'synthetic-personal-token-that-must-stay-private';
  const fail = join(operator, 'fail');
  const binary = (name, body) => { const path = join(operator, name); writeFileSync(path, `#!/usr/bin/env node\n${body}`, { mode: 0o700 }); return path; };
  const gcloud = binary('gcloud', `
import {appendFileSync} from 'node:fs';
const args=process.argv.slice(2);
appendFileSync(${JSON.stringify(calls)},JSON.stringify({kind:'gcloud',args,env:process.env})+String.fromCharCode(10));
console.log(args.includes('print-access-token')?${JSON.stringify(token)}:'owner@gmail.com');
`);
  const terraform = binary('terraform', `
import {appendFileSync,existsSync,writeFileSync} from 'node:fs';
const args=process.argv.slice(2);
appendFileSync(${JSON.stringify(calls)},JSON.stringify({kind:'terraform',args,env:process.env})+'\\n');
if(args.includes('version')) console.log(JSON.stringify({terraform_version:'${readFileSync(join(root, 'terraform-version.txt'), 'utf8').trim()}'}));
if(args.includes('plan')) {writeFileSync(args.find(value=>value.startsWith('-out=')).slice(5),'synthetic reviewed plan');if(existsSync(${JSON.stringify(fail)}))process.exit(1);}
`);
  const vars = join(operator, 'staging.tfvars.json'); const settings = { project_id: 'villas-synthetic-stage', environment: 'staging', businesses: {} };
  writeFileSync(vars, JSON.stringify(settings));
  const config = join(operator, 'config.json'); writeFileSync(config, JSON.stringify({ projectId: settings.project_id, environment: settings.environment, account: 'owner@gmail.com', configuration: 'villas-personal', stateBucket: 'villas-synthetic-stage-state', gcloudConfigDir: join(operator, 'gcloud-config'), variablesFile: vars, terraformBinary: terraform, gcloudBinary: gcloud }), { mode: 0o600 });
  const env = { PATH: process.env.PATH, HOME: directory, GOOGLE_APPLICATION_CREDENTIALS: '/do-not-read/adc.json', CLOUDSDK_CORE_PROJECT: 'employer-project', TF_CLI_ARGS: '-unsafe-host-argument' };
  const run = command => spawnSync(process.execPath, ['scripts/cloud-terraform.mjs', config, command], { cwd: checkout, env, encoding: 'utf8' });
  const records = () => readFileSync(calls, 'utf8').trim().split('\n').map(JSON.parse);
  const plan = join(checkout, '.local-state/terraform/villas-synthetic-stage/staging/reviewed.tfplan');
  return { directory, checkout, calls, token, fail, vars, settings, source, architecture, run, records, plan, close: () => rmSync(directory, { recursive: true, force: true }) };
};

test('operator commands use explicit personal credentials, scrub ambient auth and separate private project state', () => {
  const f = fixture();
  try {
    for (const command of ['init', 'plan']) {
      const result = f.run(command); assert.equal(result.status, 0, result.stderr);
      assert(!result.stdout.includes(f.token)); assert(!result.stderr.includes(f.token));
    }
    for (const record of f.records()) {
      for (const name of ['GOOGLE_APPLICATION_CREDENTIALS', 'CLOUDSDK_CORE_PROJECT', 'TF_CLI_ARGS']) assert.equal(record.env[name], undefined);
      if (record.kind === 'gcloud') {
        for (const value of ['--configuration=villas-personal', '--account=owner@gmail.com', '--project=villas-synthetic-stage']) assert(record.args.includes(value));
      } else {
        assert.equal(record.env.TF_VAR_personal_access_token, f.token);
        assert.equal(record.env.GOOGLE_OAUTH_ACCESS_TOKEN, f.token);
        assert.equal(record.env.TF_DATA_DIR, join(realpathSync(f.checkout), '.local-state/terraform/villas-synthetic-stage/staging/data'));
      }
    }
    assert(f.records().some(record => record.args.includes('-backend-config=bucket=villas-synthetic-stage-state')));
    writeFileSync(f.vars, JSON.stringify({ project_id: 'villas-other-project', environment: 'staging' }));
    const rejected = f.run('plan'); assert.equal(rejected.status, 1); assert(!rejected.stderr.includes(f.token));
    assert.equal(existsSync(f.plan), false);
  } finally { f.close(); }
});

test('failed replacement planning removes both an earlier approved plan and any partial replacement', () => {
  const f = fixture();
  try {
    assert.equal(f.run('plan').status, 0); assert(existsSync(f.plan));
    writeFileSync(f.fail, 'fail');
    assert.equal(f.run('plan').status, 1); assert.equal(existsSync(f.plan), false);
    assert.equal(f.run('apply').status, 1);
    assert(!f.records().some(record => record.args.includes('apply')));
  } finally { f.close(); }
});

test('the superseded cloud layout cannot plan or apply and invalidates a stale plan before authentication', () => {
  const f = fixture();
  try {
    for (const command of ['init', 'plan', 'apply', 'output']) {
      writeFileSync(f.architecture, JSON.stringify({ target: 'shared-app-shared-database', implementation: 'ready' }));
      assert.equal(f.run('plan').status, 0); assert(existsSync(f.plan));
      writeFileSync(f.architecture, JSON.stringify({ target: 'shared-app-shared-database', implementation: 'pending' }));
      writeFileSync(f.calls, '');
      const result = f.run(command);
      assert.equal(result.status, 1); assert.match(result.stderr, /shared hosting implementation in #48/);
      assert.equal(existsSync(f.plan), false);
      assert.equal(readFileSync(f.calls, 'utf8'), '');
    }
  } finally { f.close(); }
});

test('applying requires unchanged reviewed variables, Terraform source and plan bytes', () => {
  const f = fixture();
  try {
    for (const change of [
      () => writeFileSync(f.vars, JSON.stringify({ ...f.settings, monthly_budget_amount: 6 })),
      () => writeFileSync(f.source, 'variable "changed" {}'),
      () => writeFileSync(f.plan, 'changed plan'),
    ]) {
      assert.equal(f.run('plan').status, 0); change();
      assert.equal(f.run('apply').status, 1); assert.equal(existsSync(f.plan), false);
    }
    assert(!f.records().some(record => record.args.includes('apply')));
    assert.equal(f.run('plan').status, 0);
    assert.equal(f.run('apply').status, 0); assert.equal(existsSync(f.plan), false);
    assert.equal(f.run('apply').status, 1);
  } finally { f.close(); }
});
