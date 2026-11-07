import { spawnSync } from 'node:child_process';
import { root } from './local-db.mjs';

const run = (command, args, cwd = root) => {
  console.log(`\n${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};
const npm = 'npm';
run('./mvnw', ['--batch-mode', '--no-transfer-progress', 'clean', 'verify']);
run(process.execPath, ['scripts/sync-openapi.mjs']);
run(npm, ['ci'], `${root}/frontend`);
run(npm, ['audit', '--audit-level=high'], `${root}/frontend`);
for (const script of ['generate:api', 'format:check', 'lint', 'test:coverage', 'build']) run(npm, ['run', script], `${root}/frontend`);
run(process.execPath, ['--test', 'scripts/e2e.test.mjs', 'scripts/demo.test.mjs', 'scripts/release-artifacts.test.mjs', 'scripts/operations.test.mjs', 'scripts/backup-process.test.mjs']);
run('git', ['diff', '--exit-code', '--', 'frontend/openapi.json', 'frontend/src/api/generated']);
const untracked = spawnSync('git', ['ls-files', '--others', '--exclude-standard', '--', 'frontend/src/api/generated'], { cwd: root, encoding: 'utf8' });
if (untracked.status !== 0 || untracked.stdout.trim()) throw new Error('The generated client contains untracked files. Review and commit the complete client.');
run(npm, ['run', 'test:e2e'], `${root}/frontend`);
console.log('\nVillas verification passed.');
