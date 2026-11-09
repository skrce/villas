import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { directoryDigest, sha256, treeDigest } from './release-artifacts.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

test('publishing binds exact rehearsed images and invalidates a prior receipt on any incomplete attempt', () => {
  const directory = mkdtempSync(join(tmpdir(), 'villas-publish-test-'));
  try {
    for (const name of ['scripts', 'target/release', 'frontend/dist', 'bin']) mkdirSync(join(directory, name), { recursive: true });
    for (const name of ['publish-release.mjs', 'cloud-release-input.mjs', 'release-artifacts.mjs']) cpSync(join(root, 'scripts', name), join(directory, 'scripts', name));
    writeFileSync(join(directory, '.gitignore'), 'target/\nfrontend/dist/\nbin/\n');
    writeFileSync(join(directory, 'target/villarosa-test.jar'), 'synthetic artifact');
    writeFileSync(join(directory, 'frontend/dist/index.html'), '<title>Synthetic</title>');
    const git = args => {
      const result = spawnSync('git', args, { cwd: directory, encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
    };
    git(['init', '-q']); git(['add', '.']); git(['-c', 'user.name=Synthetic test', '-c', 'user.email=owner@example.test', 'commit', '-qm', 'fixture']);
    const source = git(['rev-parse', 'HEAD']);
    const build = { source, sourceTree: treeDigest(directory), localOnly: false, jar: 'villarosa-test.jar', jarSha256: sha256(join(directory, 'target/villarosa-test.jar')), webSha256: directoryDigest(join(directory, 'frontend/dist')), appId: 'sha256:' + 'a'.repeat(64), proxyId: 'sha256:' + 'b'.repeat(64), backupId: 'sha256:' + 'c'.repeat(64) };
    const manifest = join(directory, 'target/release/build.json'); writeFileSync(manifest, JSON.stringify(build));
    const verification = join(directory, 'target/release/verified.json'); const receipt = { source, buildSha256: sha256(manifest) };
    const calls = join(directory, 'bin/calls'); const wrongLabel = join(directory, 'bin/wrong-label'); const failPush = join(directory, 'bin/fail-push');
    writeFileSync(join(directory, 'bin/docker'), `#!/usr/bin/env node
import {appendFileSync,existsSync} from 'node:fs';
const args=process.argv.slice(2);appendFileSync(${JSON.stringify(calls)},JSON.stringify(args)+String.fromCharCode(10));
if(args[0]==='image' && args.includes('{{json .}}')) console.log(JSON.stringify({Id:args[2],Architecture:'amd64',Os:'linux',Config:{Labels:{'org.opencontainers.image.revision':existsSync(${JSON.stringify(wrongLabel)})?'f'.repeat(40):${JSON.stringify(source)}}}}));
else if(args[0]==='image') {const ref=args[2].split(':')[0];console.log(JSON.stringify([ref+'@sha256:'+({app:'d',proxy:'e',backup:'f'})[ref.split('/').at(-1)].repeat(64)]));}
else if(args[0]==='push' && args[1].includes('/backup:') && existsSync(${JSON.stringify(failPush)})) process.exit(1);
else if(!['login','tag','push'].includes(args[0])) process.exit(99);
`, { mode: 0o700 });
    const preload = join(directory, 'bin/preload.mjs');
    writeFileSync(preload, `
globalThis.fetch=async input=>{
const url=String(input);let value;
if(url.endsWith('workflows/checks.yml')) value={id:42};
else if(url.includes('/actions/runs/')) value={repository:{full_name:'skrce/villas'},head_repository:{full_name:'skrce/villas'},head_sha:process.env.GITHUB_SHA,head_branch:'master',event:'push',workflow_id:42,path:'.github/workflows/checks.yml',status:'completed',conclusion:'success'};
else if(url.includes('.actions.githubusercontent.com')) value={value:'synthetic-identity'};
else if(url==='https://sts.googleapis.com/v1/token') value={access_token:'synthetic-federation'};
else if(url.startsWith('https://iamcredentials.googleapis.com/')) value={accessToken:'synthetic-private-publisher-token'};
else throw new Error('Unexpected request in test');
return {ok:true,json:async()=>value};};
`);
    const env = { PATH: `${join(directory, 'bin')}:${dirname(process.execPath)}:${process.env.PATH}`, HOME: directory,
      VILLAS_CHECKS_RUN_ID: '123', GITHUB_SHA: source, GITHUB_REPOSITORY: 'skrce/villas', GITHUB_REF: 'refs/heads/master', GITHUB_EVENT_NAME: 'workflow_dispatch', GH_TOKEN: 'synthetic-read-token', GITHUB_RUN_ID: '456', GITHUB_RUN_ATTEMPT: '1', VILLAS_REGISTRY_PROJECT: 'villas-synthetic-stage', VILLAS_WIF_PROVIDER: 'projects/123456789/locations/global/workloadIdentityPools/villas-release/providers/github', VILLAS_PUBLISHER_ACCOUNT: 'villas-publisher@villas-synthetic-stage.iam.gserviceaccount.com', ACTIONS_ID_TOKEN_REQUEST_URL: 'https://pipelines.actions.githubusercontent.com/synthetic', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'synthetic-request-token' };
    const publication = join(directory, 'target/release/publication.json');
    for (const scenario of ['success', 'wrong-receipt', 'wrong-label', 'partial-push']) {
      rmSync(wrongLabel, { force: true }); rmSync(failPush, { force: true });
      writeFileSync(verification, JSON.stringify(scenario === 'wrong-receipt' ? { ...receipt, buildSha256: 'f'.repeat(64) } : receipt));
      if (scenario === 'wrong-label') writeFileSync(wrongLabel, 'wrong');
      if (scenario === 'partial-push') writeFileSync(failPush, 'fail');
      writeFileSync(calls, '');
      const result = spawnSync(process.execPath, ['--import', preload, 'scripts/publish-release.mjs'], { cwd: directory, env, encoding: 'utf8', timeout: 30_000 });
      assert.equal(result.status, scenario === 'success' ? 0 : 1, result.stderr);
      const commands = readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
      assert.equal(existsSync(publication), scenario === 'success');
      if (scenario === 'wrong-receipt') assert.equal(commands.length, 0);
      if (scenario === 'wrong-label') assert(!commands.some(args => args[0] === 'push'));
      if (scenario === 'success') {
        const saved = JSON.parse(readFileSync(publication)); assert.equal(saved.source, source);
        assert.equal(Object.keys(saved.images).length, 3); assert.equal(commands.filter(args => args[0] === 'push').length, 3);
        assert.equal(saved.jarSha256, build.jarSha256); assert.equal(saved.webSha256, build.webSha256);
      }
      assert(!result.stdout.includes('synthetic-private-publisher-token')); assert(!result.stderr.includes('synthetic-private-publisher-token'));
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
