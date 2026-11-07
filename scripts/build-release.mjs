import { spawnSync } from 'node:child_process';
import { cpSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { directoryDigest, git, sha256, treeDigest } from './release-artifacts.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = join(root, 'target/release/build.json');
mkdirSync(join(root, 'target/release'), { recursive: true });
rmSync(manifest, { force: true });
const pins = JSON.parse(readFileSync(join(root, 'deploy/images.json'), 'utf8'));
const source = git(root, 'rev-parse', 'HEAD');
if (!/^[a-f0-9]{40}$/.test(source ?? '')) throw new Error('Set a full source revision for the release.');
const dirty = Boolean(git(root, 'status', '--porcelain'));
const localOnly = process.argv.slice(2).join(' ') === '--local-rehearsal';
if (dirty && !localOnly) throw new Error('Commit source changes before building a release. Use --local-rehearsal only for a disposable development image.');
if (process.argv.length > 2 && !localOnly) throw new Error('Usage: node scripts/build-release.mjs [--local-rehearsal]');
const prefix = dirty ? 'villas-local-rehearsal' : (process.env.VILLAS_IMAGE_PREFIX ?? 'villas-release');
if (!/^[a-z0-9][a-z0-9./_-]*$/.test(prefix)) throw new Error('Invalid release image prefix.');
for (const image of Object.values(pins)) if (!/^[-a-zA-Z0-9./:_]+@sha256:[a-f0-9]{64}$/.test(image)) throw new Error('Release base images must be pinned by digest.');
const jars = readdirSync(join(root, 'target')).filter(name => /^villarosa-.*\.jar$/.test(name));
if (jars.length !== 1) throw new Error('Build or download exactly one verified application JAR first.');
const jar = join(root, 'target', jars[0]);
const web = join(root, 'frontend/dist');
const sourceTree = treeDigest(root);
const jarSha256 = sha256(jar);
const webSha256 = directoryDigest(web);
readFileSync(join(web, 'index.html'));
const rejectLinks = path => {
  if (lstatSync(path).isSymbolicLink()) throw new Error('Release artifacts cannot contain symbolic links.');
  if (lstatSync(path).isDirectory()) for (const child of readdirSync(path)) rejectLinks(join(path, child));
};
rejectLinks(jar); rejectLinks(web);
const context = mkdtempSync(join(tmpdir(), 'villas-image-'));
const run = args => {
  const result = spawnSync('docker', args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Release image build failed (${result.status}).`);
};
const inspect = name => {
  const result = spawnSync('docker', ['image', 'inspect', name, '--format', '{{.Id}}'], { encoding: 'utf8' });
  if (result.status !== 0 || !/^sha256:[a-f0-9]{64}$/.test(result.stdout?.trim() ?? '')) throw new Error('Cannot bind the built release image.');
  return result.stdout.trim();
};
try {
  cpSync(jar, join(context, 'villas.jar'));
  cpSync(web, join(context, 'web'), { recursive: true });
  cpSync(join(root, 'deploy/Dockerfile'), join(context, 'Dockerfile'));
  run(['build', '--build-arg', `JRE_IMAGE=${pins.jre}`, '--label', `org.opencontainers.image.revision=${source}`, '--label', 'org.opencontainers.image.source=https://github.com/skrce/villas', '--tag', `${prefix}-app:${source}`, context]);
  rmSync(context, { recursive: true }); mkdirSync(context);
  cpSync(join(root, 'deploy/proxy.Dockerfile'), join(context, 'Dockerfile'));
  cpSync(join(root, 'deploy/Caddyfile'), join(context, 'Caddyfile'));
  run(['build', '--build-arg', `CADDY_IMAGE=${pins.proxy}`, '--label', `org.opencontainers.image.revision=${source}`, '--tag', `${prefix}-proxy:${source}`, context]);
  if (sourceTree !== treeDigest(root) || jarSha256 !== sha256(jar) || webSha256 !== directoryDigest(web)) throw new Error('Release inputs changed during the build. Rebuild from a stable revision.');
  const app = `${prefix}-app:${source}`;
  const proxy = `${prefix}-proxy:${source}`;
  writeFileSync(`${manifest}.tmp`, `${JSON.stringify({ source, sourceTree, localOnly: dirty, app, proxy, appId: inspect(app), proxyId: inspect(proxy), jar: jars[0], jarSha256, webSha256, baseImages: pins }, null, 2)}\n`);
  renameSync(`${manifest}.tmp`, manifest);
} finally {
  rmSync(context, { recursive: true, force: true });
}
