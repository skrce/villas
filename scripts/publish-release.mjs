import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { directoryDigest, git, sha256, treeDigest } from './release-artifacts.mjs';
import { requireChecksRun } from './cloud-release-input.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const env = process.env;
const temporary = mkdtempSync(join(tmpdir(), 'villas-publish-'));
const dockerEnvironment = { PATH: env.PATH, HOME: temporary, DOCKER_CONFIG: temporary };
const docker = (args, input) => {
  const result = spawnSync('docker', args, { cwd: root, env: dockerEnvironment, input, encoding: 'utf8', timeout: 600_000, maxBuffer: 4_194_304 });
  if (result.status !== 0) throw new Error('Image publication could not be confirmed. Inspect the unique release tags before retrying; some images may have been published.');
  return result.stdout.trim();
};

try {
  const checks = await requireChecksRun();
  const project = env.VILLAS_REGISTRY_PROJECT;
  const provider = env.VILLAS_WIF_PROVIDER;
  const account = env.VILLAS_PUBLISHER_ACCOUNT;
  if (!/^villas-[a-z0-9-]{1,23}[a-z0-9]$/.test(project ?? '') ||
      !/^projects\/[0-9]+\/locations\/global\/workloadIdentityPools\/villas-release\/providers\/github$/.test(provider ?? '') ||
      account !== `villas-publisher@${project}.iam.gserviceaccount.com` ||
      !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? '') || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT ?? '')) throw new Error('Configure only the separate Villas registry and keyless publisher.');
  const buildPath = join(root, 'target/release/build.json');
  const build = JSON.parse(readFileSync(buildPath));
  const verification = JSON.parse(readFileSync(join(root, 'target/release/verified.json')));
  if (git(root, 'status', '--porcelain') || build.localOnly || build.source !== env.GITHUB_SHA ||
      build.sourceTree !== treeDigest(root) || verification.source !== build.source || verification.buildSha256 !== sha256(buildPath) ||
      build.jarSha256 !== sha256(join(root, 'target', build.jar)) || build.webSha256 !== directoryDigest(join(root, 'frontend/dist'))) throw new Error('Publish only unchanged exact-source artifacts after a successful image rehearsal.');
  for (const kind of ['app', 'proxy', 'backup']) {
    const image = JSON.parse(docker(['image', 'inspect', build[`${kind}Id`], '--format', '{{json .}}']));
    if (image.Id !== build[`${kind}Id`] || image.Architecture !== 'amd64' || image.Os !== 'linux' || image.Config.Labels['org.opencontainers.image.revision'] !== build.source) throw new Error('Cloud Run requires the rehearsed Linux amd64 images for this revision.');
  }
  const jsonRequest = async (url, options) => {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error('Keyless publication authentication failed.');
    return response.json();
  };
  const audience = `//iam.googleapis.com/${provider}`;
  const oidcUrl = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
  if (oidcUrl.protocol !== 'https:' || !oidcUrl.hostname.endsWith('.actions.githubusercontent.com')) throw new Error('Missing GitHub Actions identity endpoint.');
  oidcUrl.searchParams.set('audience', audience);
  const identity = await jsonRequest(oidcUrl, { headers: { Authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` } });
  const federation = await jsonRequest('https://sts.googleapis.com/v1/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      audience, grantType: 'urn:ietf:params:oauth:grant-type:token-exchange',
      requestedTokenType: 'urn:ietf:params:oauth:token-type:access_token',
      subjectTokenType: 'urn:ietf:params:oauth:token-type:jwt', subjectToken: identity.value,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
    }),
  });
  const credentials = await jsonRequest(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${account}:generateAccessToken`, {
    method: 'POST', headers: { Authorization: `Bearer ${federation.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope: ['https://www.googleapis.com/auth/cloud-platform'], lifetime: '3600s' }),
  });
  if (typeof credentials.accessToken !== 'string' || credentials.accessToken.length < 20) throw new Error('Keyless publication authentication failed.');
  docker(['login', '-u', 'oauth2accesstoken', '--password-stdin', 'https://europe-west3-docker.pkg.dev'], credentials.accessToken);
  const registry = `europe-west3-docker.pkg.dev/${project}/villas`;
  const tag = `${build.source}-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`;
  const images = {};
  for (const kind of ['app', 'proxy', 'backup']) {
    const repository = `${registry}/${kind}`;
    const remote = `${repository}:${tag}`;
    docker(['tag', build[`${kind}Id`], remote]);
    docker(['push', remote]);
    const digests = JSON.parse(docker(['image', 'inspect', remote, '--format', '{{json .RepoDigests}}']));
    const digest = digests.find(value => value.startsWith(`${repository}@sha256:`));
    if (!digest || !/@sha256:[a-f0-9]{64}$/.test(digest)) throw new Error('Published image digest could not be confirmed. Inspect the unique release tags.');
    images[kind] = digest;
  }
  writeFileSync(join(root, 'target/release/publication.json'), `${JSON.stringify({ source: build.source, sourceTree: build.sourceTree, checks, tag, jarSha256: build.jarSha256, webSha256: build.webSha256, images, publishedAt: new Date().toISOString() }, null, 2)}\n`);
  console.log('Verified Villas images published. Use publication.json digests unchanged for staging and production.');
} catch {
  console.error('Villas image publication did not complete with a verified receipt. Inspect the unique registry tags and workflow privately before retrying.');
  process.exitCode = 1;
} finally { rmSync(temporary, { recursive: true, force: true }); }
