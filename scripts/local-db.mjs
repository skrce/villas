import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const root = realpathSync(fileURLToPath(new URL('../', import.meta.url)));
if (process.platform === 'win32') throw new Error('Villas development scripts require Linux, macOS, or WSL with Docker integration.');
const instance = process.env.VILLAS_LOCAL_INSTANCE ?? 'local';
if (instance !== 'local' && instance !== 'demo' && !/^demo-[1-9][0-9]{3,4}$/.test(instance) && !/^e2e-[a-f0-9]{12}$/.test(instance)) throw new Error('Invalid Villas local database instance.');
const stateDirectory = `${root}/.local-state/${instance}`;
const stateFile = `${stateDirectory}/db.json`;
const envFile = `${stateDirectory}/db.env`;
const project = `villas-pg-${instance}-${createHash('sha256').update(root).digest('hex').slice(0, 12)}`;

export function localDatabase({ create = false } = {}) {
  if (!existsSync(stateFile)) {
    if (!create) throw new Error('Start this checkout\'s database with node scripts/dev-db.mjs start.');
    mkdirSync(stateDirectory, { recursive: true, mode: 0o700 });
    const credentials = {
      project,
      password: randomBytes(24).toString('hex'),
    };
    writeFileSync(stateFile, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  }
  const state = JSON.parse(readFileSync(stateFile, 'utf8'));
  if (state.project !== project || !/^[a-f0-9]{48}$/.test(state.password)) {
    throw new Error('Local state belongs to another checkout or is invalid. Do not copy .local-state between checkouts.');
  }
  const image = readFileSync(`${root}/postgres-image.txt`, 'utf8').trim();
  const environment = {
    ...process.env,
    VILLAS_POSTGRES_IMAGE: image,
    VILLAS_DB_PASSWORD: state.password,
  };
  writeFileSync(envFile, '', { mode: 0o600 });
  const compose = (args, options = {}) => {
    const result = spawnSync('docker', ['compose', '--project-name', project, '--env-file', envFile, '--file', `${root}/compose.yaml`, ...args], {
      cwd: root,
      env: environment,
      encoding: 'utf8',
      stdio: options.capture ? ['pipe', 'pipe', 'pipe'] : 'inherit',
      input: options.input,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Villas Docker Compose command failed with exit status ${result.status}. Check Docker and this checkout's database status.`);
    return result.stdout?.trim();
  };
  const port = () => {
    const address = compose(['port', 'db', '5432'], { capture: true });
    const match = /^127\.0\.0\.1:(\d+)$/.exec(address);
    if (!match) throw new Error('Expected a running PostgreSQL port bound to 127.0.0.1. Start this checkout\'s database first.');
    return Number(match[1]);
  };
  const sql = (input) => compose(['exec', '-T', 'db', 'sh', '-c', 'PGPASSWORD="$POSTGRES_PASSWORD" exec psql --username=villas_local --dbname=villarosa --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1'], { capture: true, input });
  return { compose, port, sql, password: state.password };
}
