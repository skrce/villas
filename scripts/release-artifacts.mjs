import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function git(root, ...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Cannot verify release source revision.');
  return result.stdout.trim();
}
export const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex');
export function treeDigest(root) {
  const names = git(root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean).sort();
  const hash = createHash('sha256');
  for (const name of names) {
    const path = join(root, name);
    hash.update(`${name}\0${lstatSync(path).mode & 0o111}\0${sha256(path)}\0`);
  }
  return hash.digest('hex');
}
export function directoryDigest(directory) {
  const hash = createHash('sha256');
  const visit = (path, prefix = '') => {
    for (const name of readdirSync(path).sort()) {
      const file = join(path, name);
      if (lstatSync(file).isSymbolicLink()) throw new Error('Release artifacts cannot contain symbolic links.');
      if (lstatSync(file).isDirectory()) visit(file, `${prefix}${name}/`);
      else hash.update(`${prefix}${name}\0${sha256(file)}\0`);
    }
  };
  visit(directory);
  return hash.digest('hex');
}
