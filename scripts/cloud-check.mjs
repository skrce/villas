import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const binary = process.env.VILLAS_TERRAFORM_BINARY ?? 'terraform';
const home = mkdtempSync(join(tmpdir(), 'villas-tf-check-'));
const environment = { PATH: process.env.PATH, HOME: home, TF_IN_AUTOMATION: '1', CHECKPOINT_DISABLE: '1' };
try {
  const version = spawnSync(binary, ['version', '-json'], { env: environment, encoding: 'utf8' });
  if (version.status !== 0 || JSON.parse(version.stdout).terraform_version !== readFileSync(join(root, 'terraform-version.txt'), 'utf8').trim()) throw new Error('Use the pinned Terraform version.');
  for (const args of [['fmt', '-check', '-recursive'], ['init', '-backend=false', '-input=false', '-lockfile=readonly'], ['validate', '-no-color'], ['test', '-no-color']]) {
    const result = spawnSync(binary, [`-chdir=${join(root, 'deploy/cloud')}`, ...args], { env: environment, stdio: 'inherit' });
    if (result.status !== 0) throw new Error('Cloud preparation checks failed. No backend or live provider acceptance was performed.');
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { rmSync(home, { recursive: true, force: true }); }
