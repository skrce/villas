import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = () => {
  const directory = mkdtempSync(join(tmpdir(), 'villas-backup-test-'));
  const bin = join(directory, 'bin'); mkdirSync(bin);
  const script = (name, source) => writeFileSync(join(bin, name), `#!/usr/bin/env node\n${source}`, { mode: 0o755 });
  for (const [name, value] of Object.entries({ db: 'synthetic', repository: join(directory, 'repo'), password: 'synthetic', credentials: '{}' })) writeFileSync(join(directory, name), value, { mode: 0o600 });
  const env = { PATH: `${bin}:${process.env.PATH}`, VILLAS_BACKUP_DB_HOST: 'db', VILLAS_BACKUP_DB_PASSWORD_FILE: join(directory, 'db'), VILLAS_BACKUP_REPOSITORY_FILE: join(directory, 'repository'), VILLAS_BACKUP_PASSWORD_FILE: join(directory, 'password'), VILLAS_BACKUP_CREDENTIALS_FILE: join(directory, 'credentials'), VILLAS_BACKUP_LOCAL_REHEARSAL: '1', VILLAS_LOCAL_INSTANCE: 'e2e-0123456789ab', VILLAS_BACKUP_HOST: 'villas-rehearsal-test', VILLAS_KEEP_HOURLY: '1', VILLAS_KEEP_DAILY: '1', VILLAS_BACKUP_STATUS_FILE: join(directory, 'status.json') };
  const run = async (...args) => {
    const child = spawn(process.execPath, ['deploy/backup.mjs', ...args], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.resume(); let output = ''; child.stderr.on('data', part => output += part);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, 4000);
    const code = await new Promise(resolve => child.once('close', resolve)); clearTimeout(timer);
    assert.equal(timedOut, false, 'A failed consumer must settle its producer without external interruption.');
    return { code, output };
  };
  return { directory, env, script, run, close: () => rmSync(directory, { recursive: true, force: true }) };
};

for (const mode of ['backup', 'restore']) test(`${mode} cancels a delayed, backpressured producer when its consumer exits`, async () => {
  const f = fixture();
  const snapshot = 'a'.repeat(64);
  const producer = "process.on('SIGTERM',()=>{}); setTimeout(()=>process.stdout.write(Buffer.alloc(4*1024*1024,65)),100);";
  try {
    f.script('pg_dump', producer);
    f.script('psql', `if(process.argv.includes('--tuples-only')) console.log('0'); else process.exit(1);`);
    f.script('pg_restore', `if(process.argv.includes('--list')) { for await (const chunk of process.stdin) {} console.log('1; 1 1 TABLE public synthetic owner'); } else process.exit(1);`);
    f.script('restic', `
const command=process.argv[2];
if(command==='snapshots') console.log(JSON.stringify(${mode === 'restore' ? `[{id:'${snapshot}',tags:['villas-complete']}]` : '[]'}));
else if(command==='dump') { ${producer} }
else process.exit(1);
`);
    const result = await f.run(mode, ...(mode === 'restore' ? [snapshot] : []));
    assert.equal(result.code, 1); assert.match(result.output, /operation failed/);
  } finally { f.close(); }
});

test('failed partial dumps are discarded, abandoned pending snapshots are scoped, and host credentials stay out of child environments', async () => {
  const f = fixture(); const calls = join(f.directory, 'calls');
  const old = Date.now() - 4_000_000;
  const expired = `villas-pending-${old}-${old + 60_000}-${'a'.repeat(24)}`;
  try {
    f.env.AWS_SECRET_ACCESS_KEY = 'host-credential-must-not-escape';
    f.script('pg_dump', "process.stdout.write('synthetic partial SQL',()=>process.exit(1));");
    f.script('restic', `
import {appendFileSync,readFileSync,writeFileSync} from 'node:fs';
const args=process.argv.slice(2);
appendFileSync(${JSON.stringify(calls)},JSON.stringify({args,env:process.env})+'\\n');
const tagPath=${JSON.stringify(join(f.directory, 'tag'))};
if(args[0]==='snapshots') {
 const i=args.indexOf('--tag');
 if(i<0) console.log(JSON.stringify([
  {id:'b'.repeat(64),hostname:'villas-rehearsal-test',paths:['/villas.sql'],tags:[${JSON.stringify(expired)}]},
  {id:'c'.repeat(64),hostname:'other-host',paths:['/villas.sql'],tags:[${JSON.stringify(expired)}]},
  {id:'d'.repeat(64),hostname:'villas-rehearsal-test',paths:['/other'],tags:[${JSON.stringify(expired)}]},
  {id:'e'.repeat(64),hostname:'villas-rehearsal-test',paths:['/villas.sql'],tags:['villas-complete',${JSON.stringify(expired)}]}
 ]));
 else console.log(JSON.stringify([{id:'a'.repeat(64),hostname:'villas-rehearsal-test',paths:['/villas.sql'],tags:[args[i+1]]}]));
} else if(args[0]==='backup') {
 writeFileSync(tagPath,args[args.indexOf('--tag')+1]);
 for await(const chunk of process.stdin) {}
 console.log(JSON.stringify({message_type:'summary',snapshot_id:'a'.repeat(64)}));
}
`);
    const result = await f.run('backup'); assert.equal(result.code, 1);
    const records = readFileSync(calls, 'utf8').trim().split('\n').map(JSON.parse);
    const forgotten = records.filter(record => record.args[0] === 'forget').flatMap(record => record.args);
    assert(forgotten.includes('b'.repeat(64))); assert(forgotten.includes('a'.repeat(64)));
    for (const id of ['c', 'd', 'e']) assert(!forgotten.includes(id.repeat(64)));
    assert(!records.some(record => Object.values(record.env).includes('host-credential-must-not-escape')));
    assert(!records.some(record => record.args[0] === 'tag'));
    assert.equal(JSON.parse(readFileSync(join(f.directory, 'status.json'))).ok, false);
  } finally { f.close(); }
});
