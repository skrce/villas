import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'villas-terraform-install-'));
try {
  const destination = process.argv[2];
  const platform = `${process.platform}_${process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'amd64' : 'unsupported'}`;
  const version = readFileSync(join(root, 'terraform-version.txt'), 'utf8').trim();
  if (process.argv.length !== 3 || !isAbsolute(destination ?? '') || !['darwin_arm64', 'linux_amd64'].includes(platform) || !/^1\.[0-9]+\.[0-9]+$/.test(version)) throw new Error('Use an absolute installation directory and a supported pinned platform.');
  const filename = `terraform_${version}_${platform}.zip`;
  const checksum = readFileSync(join(root, 'deploy/cloud/terraform-checksums.txt'), 'utf8').trim().split('\n').map(line => line.split(/\s+/)).find(entry => entry[1] === filename)?.[0];
  if (!/^[a-f0-9]{64}$/.test(checksum ?? '')) throw new Error('The Terraform archive needs a reviewed checksum.');
  const response = await fetch(`https://releases.hashicorp.com/terraform/${version}/${filename}`, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error('Terraform archive download failed.');
  const archive = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(archive).digest('hex') !== checksum) throw new Error('Terraform archive checksum mismatch.');
  const file = join(temporary, filename);
  writeFileSync(file, archive); mkdirSync(destination, { recursive: true });
  const result = spawnSync('unzip', ['-o', file, 'terraform', '-d', destination], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Terraform extraction failed.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { rmSync(temporary, { recursive: true, force: true }); }
