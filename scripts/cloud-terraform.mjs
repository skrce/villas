import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCloudConfig } from './cloud-config.mjs';
import { sha256 } from './release-artifacts.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
let temporary;
let plan;
let proof;
let invalidate = false;
let architectureBlocked = false;
const invalidatePlan = () => {
  if (plan) rmSync(plan, { force: true });
  if (proof) rmSync(proof, { force: true });
};
const sourceHash = () => {
  const files = [];
  const visit = (directory, prefix = '') => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === '.terraform') continue;
      const file = join(directory, entry.name);
      if (entry.isDirectory()) visit(file, `${prefix}${entry.name}/`);
      else if (/\.(tf|hcl)$/.test(entry.name) || entry.name === 'architecture.json') files.push([`${prefix}${entry.name}`, sha256(file)]);
    }
  };
  visit(join(root, 'deploy/cloud'));
  return createHash('sha256').update(JSON.stringify(files)).digest('hex');
};
try {
  const [configPath, command] = process.argv.slice(2);
  if (process.argv.length !== 4 || !isAbsolute(configPath ?? '') || !['init', 'plan', 'apply', 'output'].includes(command)) throw new Error();
  const mode = statSync(configPath).mode;
  if ((mode & 0o077) !== 0 || statSync(configPath).size > 16_384) throw new Error();
  const config = validateCloudConfig(JSON.parse(readFileSync(configPath, 'utf8')), root);
  const directory = join(root, '.local-state', 'terraform', config.projectId, config.environment);
  mkdirSync(directory, { recursive: true, mode: 0o700 }); chmodSync(directory, 0o700);
  plan = join(directory, 'reviewed.tfplan'); proof = join(directory, 'reviewed.json');
  invalidate = ['plan', 'apply'].includes(command);
  if (command === 'plan') invalidatePlan();
  const architecture = JSON.parse(readFileSync(join(root, 'deploy/cloud/architecture.json'), 'utf8'));
  if (architecture.target !== 'shared-app-shared-database' || architecture.implementation !== 'ready') {
    architectureBlocked = true;
    invalidatePlan();
    throw new Error();
  }
  const inputs = { configSha256: sha256(configPath), variablesSha256: sha256(config.variablesFile), sourceSha256: sourceHash() };
  if (command === 'apply') {
    const reviewed = JSON.parse(readFileSync(proof, 'utf8'));
    if (reviewed.planSha256 !== sha256(plan) || Object.entries(inputs).some(([key, value]) => reviewed[key] !== value)) throw new Error();
  }
  const basicEnvironment = { PATH: process.env.PATH, HOME: process.env.HOME, CLOUDSDK_CONFIG: config.gcloudConfigDir, CLOUDSDK_CORE_DISABLE_PROMPTS: '1' };
  const gcloud = args => {
    const result = spawnSync(config.gcloudBinary, [`--configuration=${config.configuration}`, `--account=${config.account}`, `--project=${config.projectId}`, ...args], { env: basicEnvironment, encoding: 'utf8', timeout: 30_000, maxBuffer: 65_536 });
    if (result.status !== 0) throw new Error();
    return result.stdout.trim();
  };
  if (gcloud(['config', 'get-value', 'account']) !== config.account) throw new Error();
  const token = gcloud(['auth', 'print-access-token']);
  if (token.length < 20 || /[\s\0]/.test(token)) throw new Error();
  temporary = mkdtempSync(join(tmpdir(), 'villas-tf-home-'));
  const environment = { PATH: process.env.PATH, HOME: temporary, TF_IN_AUTOMATION: '1', CHECKPOINT_DISABLE: '1',
    TF_DATA_DIR: join(directory, 'data'), TF_VAR_personal_access_token: token, GOOGLE_OAUTH_ACCESS_TOKEN: token };
  const variables = JSON.parse(readFileSync(config.variablesFile, 'utf8'));
  const allowed = ['project_id', 'registry_project_id', 'environment', 'billing_account', 'billing_currency', 'monthly_budget_amount', 'notification_channels', 'businesses'];
  const businessFields = ['name', 'phase', 'neon_host', 'public_origin', 'app_image', 'backup_image', 'maintenance_image', 'secret_versions', 'maintenance', 'external_liveness', 'public_access', 'schedules_enabled', 'launch_qualified', 'verification_window'];
  if (variables.project_id !== config.projectId || variables.environment !== config.environment || Object.keys(variables).some(key => !allowed.includes(key)) ||
      Object.values(variables.businesses ?? {}).some(business => Object.keys(business).some(key => !businessFields.includes(key)) || Object.values(business.secret_versions ?? {}).some(value => !/^[1-9][0-9]*$/.test(value)))) throw new Error();
  const version = spawnSync(config.terraformBinary, ['version', '-json'], { env: environment, encoding: 'utf8' });
  if (version.status !== 0 || JSON.parse(version.stdout).terraform_version !== readFileSync(join(root, 'terraform-version.txt'), 'utf8').trim()) throw new Error();
  const args = command === 'init' ? ['init', '-input=false', `-backend-config=bucket=${config.stateBucket}`, `-backend-config=prefix=villas/${config.environment}`] :
    command === 'plan' ? ['plan', '-input=false', '-lock-timeout=60s', `-var-file=${config.variablesFile}`, `-out=${plan}`] :
    command === 'apply' ? ['apply', '-input=false', '-lock-timeout=60s', plan] : ['output', '-json'];
  const result = spawnSync(config.terraformBinary, [`-chdir=${join(root, 'deploy/cloud')}`, ...args], { env: environment, stdio: 'inherit', timeout: 3_600_000 });
  if (result.status !== 0) throw new Error();
  if (command === 'plan') writeFileSync(proof, `${JSON.stringify({ ...inputs, planSha256: sha256(plan) })}\n`, { mode: 0o600 });
  if (command === 'apply') invalidatePlan();
} catch {
  if (invalidate) invalidatePlan();
  console.error(architectureBlocked ? 'Villas live deployment is blocked until the shared hosting implementation in #48 is ready. Local mock checks remain available.' : 'Villas Terraform did not complete successfully. Check the private 0600 config, explicit personal account, pinned tools and reviewed plan; inspect remote state before retrying an apply.');
  process.exitCode = 1;
} finally { if (temporary) rmSync(temporary, { recursive: true, force: true }); }
