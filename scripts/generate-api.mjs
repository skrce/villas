import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { root } from './local-db.mjs';

const { version, sha256 } = JSON.parse(readFileSync(`${root}/frontend/openapi-generator.json`, 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(version) || !/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Invalid generator version/checksum.');
const cache = `${root}/.local-state/openapi-generator`;
mkdirSync(cache, { recursive: true });
const jar = `${cache}/${version}.jar`;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
if (!existsSync(jar)) {
  const response = await fetch(`https://repo.maven.apache.org/maven2/org/openapitools/openapi-generator-cli/${version}/openapi-generator-cli-${version}.jar`, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Generator download returned HTTP ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (digest(bytes) !== sha256) throw new Error('Downloaded generator checksum does not match the pinned SHA-256.');
  writeFileSync(jar, bytes);
}
if (digest(readFileSync(jar)) !== sha256) throw new Error('Cached generator checksum does not match. Remove the cached JAR and retry.');
const output = mkdtempSync(`${root}/.local-state/openapi-output-`);
try {
  const java = process.env.JAVA_HOME ? `${process.env.JAVA_HOME}/bin/java` : 'java';
  const result = spawnSync(java, ['-jar', jar, 'generate', '-i', './openapi.json', '-g', 'typescript-fetch', '-o', output, '--additional-properties=typescriptThreePlus=true'], {
    cwd: `${root}/frontend`,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`API generation failed with exit status ${result.status}.`);
  const destination = `${root}/frontend/src/api/generated`;
  rmSync(destination, { recursive: true, force: true });
  renameSync(output, destination);
} finally {
  rmSync(output, { recursive: true, force: true });
}
