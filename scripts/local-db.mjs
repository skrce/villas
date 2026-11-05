import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const root = realpathSync(fileURLToPath(new URL('../', import.meta.url)));
if (process.platform === 'win32') throw new Error('Villas development scripts require Linux, macOS, or WSL with Docker integration.');
const instance = process.env.VILLAS_LOCAL_INSTANCE ?? 'local';
if (instance !== 'local' && !/^e2e-[a-f0-9]{12}$/.test(instance)) throw new Error('Invalid Villas local database instance.');
const stateDirectory = `${root}/.local-state/${instance}`;
const stateFile = `${stateDirectory}/db.json`;
const envFile = `${stateDirectory}/db.env`;
const project = `villas-${instance}-${createHash('sha256').update(root).digest('hex').slice(0, 12)}`;

export function localDatabase({ create = false } = {}) {
  if (!existsSync(stateFile)) {
    if (!create) throw new Error('Start this checkout\'s database with node scripts/dev-db.mjs start.');
    mkdirSync(stateDirectory, { recursive: true, mode: 0o700 });
    const credentials = {
      project,
      password: randomBytes(24).toString('hex'),
      rootPassword: randomBytes(24).toString('hex'),
    };
    writeFileSync(stateFile, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  }
  const state = JSON.parse(readFileSync(stateFile, 'utf8'));
  if (state.project !== project || !/^[a-f0-9]{48}$/.test(state.password) || !/^[a-f0-9]{48}$/.test(state.rootPassword)) {
    throw new Error('Local state belongs to another checkout or is invalid. Do not copy .local-state between checkouts.');
  }
  const image = readFileSync(`${root}/mariadb-image.txt`, 'utf8').trim();
  const environment = {
    ...process.env,
    VILLAS_MARIADB_IMAGE: image,
    VILLAS_DB_PASSWORD: state.password,
    VILLAS_DB_ROOT_PASSWORD: state.rootPassword,
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
    const address = compose(['port', 'db', '3306'], { capture: true });
    const match = /^127\.0\.0\.1:(\d+)$/.exec(address);
    if (!match) throw new Error('Expected a running MariaDB port bound to 127.0.0.1. Start this checkout\'s database first.');
    return Number(match[1]);
  };
  const sql = (input) => compose(['exec', '-T', 'db', 'sh', '-c', 'MYSQL_PWD="$MARIADB_PASSWORD" exec mariadb --user=villas_local --database=villarosa --batch --skip-column-names --default-character-set=utf8mb4'], { capture: true, input });
  return { compose, port, sql, password: state.password };
}
