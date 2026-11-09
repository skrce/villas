import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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
const templates = mkdtempSync(`${root}/.local-state/openapi-templates-`);
const validateDocumentation = directory => {
  const files = readdirSync(directory, { recursive: true }).filter(name => name.endsWith('.md')).map(name => join(directory, name));
  for (const file of files) {
    for (const [, target] of readFileSync(file, 'utf8').matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      if (/^[a-z]+:/i.test(target)) continue;
      const [path, fragment] = target.split('#');
      const destination = path ? resolve(dirname(file), decodeURIComponent(path)) : file;
      if (!destination.startsWith(`${directory}/`) || !existsSync(destination)) throw new Error('Generated API documentation contains a missing target.');
      if (fragment) {
        const content = readFileSync(destination, 'utf8');
        const ids = [...content.matchAll(/<a id="([^"]+)"/g)].map(match => match[1]);
        const headings = [...content.matchAll(/^#{1,6}\s+(.+)$/gm)].map(match => match[1].toLowerCase().replace(/[^\p{L}\p{N}_ -]/gu, '').trim().replaceAll(' ', '-'));
        if (![...ids, ...headings].includes(decodeURIComponent(fragment))) throw new Error('Generated API documentation contains a missing anchor.');
      }
    }
  }
};
try {
  const java = process.env.JAVA_HOME ? `${process.env.JAVA_HOME}/bin/java` : 'java';
  const exported = spawnSync(java, ['-jar', jar, 'author', 'template', '-g', 'typescript-fetch', '-o', templates], { encoding: 'utf8', maxBuffer: 1_048_576 });
  if (exported.status !== 0) throw new Error('Cannot export the pinned generator templates.');
  const apiDoc = join(templates, 'api_doc.mustache');
  const source = readFileSync(apiDoc, 'utf8');
  if (source.split('## {{operationId}}').length !== 2) throw new Error('Review API documentation anchors for the new generator template.');
  const example = '### Example\n\n```ts\n{{>api_example}}\n```';
  if (!source.includes(example)) throw new Error('Review session-cookie examples for the new generator template.');
  writeFileSync(apiDoc, source.replace('## {{operationId}}', '<a id="{{operationIdLowerCase}}"></a>\n## {{operationId}}')
    .replace(example, 'Use the Villas session-aware clients described in [client configuration](../README.md#authorization).'));

  copyFileSync(`${root}/frontend/openapi-templates/README.mustache`, join(templates, 'README.mustache'));
  const result = spawnSync(java, ['-jar', jar, 'generate', '-i', './openapi.json', '-g', 'typescript-fetch', '-o', output, '-t', templates, '-c', `${root}/frontend/openapi-client-config.json`,
    '--additional-properties=typescriptThreePlus=true', '--global-property=apis,models,supportingFiles=README.md:index.ts:runtime.ts'], {
    cwd: `${root}/frontend`,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`API generation failed with exit status ${result.status}.`);
  validateDocumentation(output);
  const destination = `${root}/frontend/src/api/generated`;
  rmSync(destination, { recursive: true, force: true });
  renameSync(output, destination);
} finally {
  rmSync(output, { recursive: true, force: true });
  rmSync(templates, { recursive: true, force: true });
}
