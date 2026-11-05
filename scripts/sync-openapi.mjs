import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const sort = (value) => {
  if (Array.isArray(value)) return value.map(sort);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sort(value[key])]));
  }
  return value;
};
const contract = JSON.parse(readFileSync(`${root}target/openapi.json`, 'utf8'));
if (contract.servers?.[0]?.url !== '/api/v1') throw new Error('Unexpected API base path.');
const output = `${JSON.stringify(sort(contract), null, 2)}\n`;
const destination = `${root}frontend/openapi.json`;
if (process.argv.includes('--write')) {
  writeFileSync(destination, output);
} else if (readFileSync(destination, 'utf8') !== output) {
  throw new Error('API contract changed. Run node scripts/sync-openapi.mjs --write, then regenerate the client.');
}
