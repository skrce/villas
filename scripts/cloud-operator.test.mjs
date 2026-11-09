import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

test('operator commands use explicit personal credentials, scrub ambient auth and separate private project state', () => {
  const directory = mkdtempSync(join(tmpdir(), 'villas-operator-test-'));
  try {
    const checkout = join(directory, 'checkout'); const operator = join(directory, 'operator');
    mkdirSync(join(checkout, 'scripts'), { recursive: true }); mkdirSync(operator);
    for (const name of ['cloud-config.mjs', 'cloud-terraform.mjs']) cpSync(join(root, 'scripts', name), join(checkout, 'scripts', name));
    cpSync(join(root, 'terraform-version.txt'), join(checkout, 'terraform-version.txt'));
    const calls = join(operator, 'calls'); const token = 'synthetic-personal-token-that-must-stay-private';
    const binary = (name, body) => { const path = join(operator, name); writeFileSync(path, `#!/usr/bin/env node\n${body}`, { mode: 0o700 }); return path; };
    const gcloud = binary('gcloud', `import {appendFileSync} from 'node:fs';const args=process.argv.slice(2);appendFileSync(${JSON.stringify(calls)},JSON.stringify({kind:'gcloud',args,env:process.env})+'\\n');console.log(args.includes('print-access-token')?${JSON.stringify(token)}:'owner@gmail.com');`);
    const terraform = binary('terraform', `import {appendFileSync} from 'node:fs';const args=process.argv.slice(2);appendFileSync(${JSON.stringify(calls)},JSON.stringify({kind:'terraform',args,env:process.env})+'\\n');if(args.includes('version')) console.log(JSON.stringify({terraform_version:'${readFileSync(join(root, 'terraform-version.txt'), 'utf8').trim()}'}));`);
    const vars = join(operator, 'staging.tfvars.json'); writeFileSync(vars, JSON.stringify({ project_id: 'villas-synthetic-stage', environment: 'staging', businesses: {} }));
    const config = join(operator, 'config.json'); writeFileSync(config, JSON.stringify({ projectId: 'villas-synthetic-stage', environment: 'staging', account: 'owner@gmail.com', configuration: 'villas-personal', stateBucket: 'villas-synthetic-stage-state', gcloudConfigDir: join(operator, 'gcloud-config'), variablesFile: vars, terraformBinary: terraform, gcloudBinary: gcloud }), { mode: 0o600 });
    const env = { PATH: process.env.PATH, HOME: directory, GOOGLE_APPLICATION_CREDENTIALS: '/do-not-read/adc.json', CLOUDSDK_CORE_PROJECT: 'employer-project', TF_CLI_ARGS: '-unsafe-host-argument' };
    for (const command of ['init', 'plan']) {
      const result = spawnSync(process.execPath, ['scripts/cloud-terraform.mjs', config, command], { cwd: checkout, env, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      assert(!result.stdout.includes(token)); assert(!result.stderr.includes(token));
    }
    const records = readFileSync(calls, 'utf8').trim().split('\n').map(JSON.parse);
    for (const record of records) {
      assert.equal(record.env.GOOGLE_APPLICATION_CREDENTIALS, undefined);
      assert.equal(record.env.CLOUDSDK_CORE_PROJECT, undefined);
      assert.equal(record.env.TF_CLI_ARGS, undefined);
      if (record.kind === 'gcloud') {
        assert(record.args.includes('--configuration=villas-personal')); assert(record.args.includes('--account=owner@gmail.com')); assert(record.args.includes('--project=villas-synthetic-stage'));
      } else {
        assert.equal(record.env.TF_VAR_personal_access_token, token);
        assert.equal(record.env.GOOGLE_OAUTH_ACCESS_TOKEN, token);
        assert.equal(record.env.TF_DATA_DIR, join(realpathSync(checkout), '.local-state/terraform/villas-synthetic-stage/staging/data'));
      }
    }
    assert(records.some(record => record.args.includes('-backend-config=bucket=villas-synthetic-stage-state')));
    writeFileSync(vars, JSON.stringify({ project_id: 'villas-other-project', environment: 'staging' }));
    const rejected = spawnSync(process.execPath, ['scripts/cloud-terraform.mjs', config, 'plan'], { cwd: checkout, env, encoding: 'utf8' });
    assert.equal(rejected.status, 1); assert(!rejected.stderr.includes(token));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
