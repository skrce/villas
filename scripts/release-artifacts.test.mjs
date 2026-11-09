import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = () => {
  const directory = mkdtempSync(join(tmpdir(), 'villas-artifact-test-'));
  for (const name of ['scripts', 'deploy', 'frontend/dist', 'target', 'bin']) mkdirSync(join(directory, name), { recursive: true });
  for (const name of ['build-release.mjs', 'release-check.mjs', 'release-artifacts.mjs']) cpSync(join(root, 'scripts', name), join(directory, 'scripts', name));
  for (const name of ['Dockerfile', 'proxy.Dockerfile', 'backup.Dockerfile', 'backup.mjs', 'monitor.mjs', 'recovery-policy.mjs', 'recovery-quarantine.sql', 'Caddyfile', 'maintenance.Caddyfile', 'images.json']) cpSync(join(root, 'deploy', name), join(directory, 'deploy', name));
  writeFileSync(join(directory, '.gitignore'), 'target/\nfrontend/dist/\nbin/\n');
  writeFileSync(join(directory, 'source.txt'), 'current source');
  writeFileSync(join(directory, 'postgres-image.txt'), `postgres:test@sha256:${'a'.repeat(64)}`);
  writeFileSync(join(directory, 'frontend/dist/index.html'), '<title>Fixture</title>');
  writeFileSync(join(directory, 'target/villarosa-test.jar'), 'synthetic artifact');
  writeFileSync(join(directory, 'bin/docker'), `#!/usr/bin/env node
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(join(directory, 'target/calls.jsonl'))}, JSON.stringify(args)+'\\n');
if(args[0]==='build') process.exit(process.env.VILLAS_TEST_FAIL_BUILD ? 1 : 0);
if(args[0]==='context') { console.log('unix:///fixture.sock'); process.exit(0); }
if(args[0]==='image' && args[1]==='inspect') {
 const id='sha256:'+(existsSync(${JSON.stringify(join(directory, 'target/retag'))}) ? 'c' : args[2].includes('-app:') ? 'a' : 'b').repeat(64);
 if(args.includes('{{.Id}}')) console.log(id);
 else console.log(JSON.stringify({Id:id, Config:{Labels:{'org.opencontainers.image.revision':readFileSync(${JSON.stringify(join(directory, 'bin/revision'))}, 'utf8')}}}));
 process.exit(0);
}
process.exit(99);
`, { mode: 0o755 });
  const git = args => {
    const result = spawnSync('git', args, { cwd: directory, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git(['init', '-q']); git(['add', '.']);
  git(['-c', 'user.name=Synthetic test', '-c', 'user.email=owner@example.test', 'commit', '-qm', 'fixture']);
  writeFileSync(join(directory, 'bin/revision'), git(['rev-parse', 'HEAD']));
  const calls = join(directory, 'target/calls.jsonl');
  const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('VILLAS_') && !name.startsWith('SPRING_')));
  const run = (script, extra = {}) => spawnSync(process.execPath, [`scripts/${script}.mjs`], {
    cwd: directory,
    env: { ...environment, PATH: `${join(directory, 'bin')}:${process.env.PATH}`, VILLAS_TEST_CALLS: calls, VILLAS_TEST_SOURCE: git(['rev-parse', 'HEAD']), ...extra },
    encoding: 'utf8',
  });
  return { directory, run, calls, manifest: join(directory, 'target/release/build.json'), close: () => rmSync(directory, { recursive: true, force: true }) };
};

test('a failed build invalidates the previous manifest', () => {
  const f = fixture();
  try {
    const success = f.run('build-release'); assert.equal(success.status, 0, success.stderr);
    const manifest = JSON.parse(readFileSync(f.manifest));
    assert.equal(manifest.appId, `sha256:${'a'.repeat(64)}`);
    assert.equal(manifest.proxyId, `sha256:${'b'.repeat(64)}`);
    assert.equal(manifest.localOnly, false);
    assert.equal(f.run('build-release', { VILLAS_TEST_FAIL_BUILD: '1' }).status, 1);
    assert.equal(existsSync(f.manifest), false);
  } finally { f.close(); }
});

for (const [name, path] of [['source', 'source.txt'], ['JAR', 'target/villarosa-test.jar'], ['frontend', 'frontend/dist/index.html']]) {
  test(`a changed ${name} rejects the rehearsal before any Docker command`, () => {
    const f = fixture();
    try {
      const built = f.run('build-release'); assert.equal(built.status, 0, built.stderr);
      writeFileSync(f.calls, ''); writeFileSync(join(f.directory, path), 'changed');
      const result = f.run('release-check'); assert.equal(result.status, 1);
      assert.match(result.stderr, /manifest does not match/);
      assert.equal(readFileSync(f.calls, 'utf8'), '');
    } finally { f.close(); }
  });
}

test('a retagged image fails before Compose creates resources', () => {
  const f = fixture();
  try {
    const built = f.run('build-release'); assert.equal(built.status, 0, built.stderr);
    writeFileSync(f.calls, '');
    writeFileSync(join(f.directory, 'target/retag'), 'retagged');
    const result = f.run('release-check'); assert.equal(result.status, 1);
    assert.match(result.stderr, /image identity does not match/);
    assert(!readFileSync(f.calls, 'utf8').includes('compose'));
  } finally { f.close(); }
});
