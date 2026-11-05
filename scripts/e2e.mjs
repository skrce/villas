import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';

process.env.VILLAS_LOCAL_INSTANCE = `e2e-${randomBytes(6).toString('hex')}`;
process.env.VILLAS_LOCAL_USERNAME = 'test';
process.env.VILLAS_LOCAL_PASSWORD = randomBytes(24).toString('hex');
process.env.VILLAS_PORT = '19098';
process.env.VILLAS_API_TARGET = 'http://127.0.0.1:19098';
const { localDatabase, root } = await import('./local-db.mjs');
const database = localDatabase({ create: true });
const run = (args, cwd = root) => {
  const result = spawnSync(process.execPath, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Villas browser check failed with exit status ${result.status}.`);
};
try {
  run(['scripts/dev-db.mjs', 'start']);
  run(['scripts/dev-db.mjs', 'fixtures']);
  run(['node_modules/@playwright/test/cli.js', 'test'], `${root}/frontend`);
} finally {
  database.compose(['down', '--volumes']);
  rmSync(`${root}/.local-state/${process.env.VILLAS_LOCAL_INSTANCE}`, { recursive: true });
}
