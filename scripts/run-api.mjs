import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { localDatabase, root } from './local-db.mjs';

if (!process.env.VILLAS_LOCAL_INSTANCE && existsSync(`${root}/.env.local`)) loadEnvFile(`${root}/.env.local`);
const migrate = process.argv.includes('--migrate');
const recovery = process.argv.includes('--recover-owner');
const bootstrap = process.argv.includes('--bootstrap-owner') || recovery;
if (recovery && process.argv.includes('--replace-pending')) throw new Error('Recovery does not replace pending invitations.');
if (migrate && bootstrap) throw new Error('Run migration and owner setup as separate commands.');
if (process.argv.includes('--replace-pending') && !bootstrap) throw new Error('--replace-pending requires --bootstrap-owner.');
if (!migrate && !bootstrap && (!process.env.VILLAS_GOOGLE_CLIENT_ID || !process.env.VILLAS_GOOGLE_CLIENT_SECRET)) {
  throw new Error('Configure the private Villas Google client, or use the explicit local demo.');
}
const database = localDatabase();
const environment = { ...process.env };
for (const key of Object.keys(environment)) {
  if (key.startsWith('SPRING_') || key.startsWith('VILLAS_DB_')) delete environment[key];
}
Object.assign(environment, {
  VILLAS_MODE: 'local',
  VILLAS_BIND_ADDRESS: '127.0.0.1',
  VILLAS_DB_URL: `jdbc:mariadb://127.0.0.1:${database.port()}/villarosa`,
  VILLAS_DB_USERNAME: 'villas_local',
  VILLAS_DB_PASSWORD: database.password,
});
const packaged = migrate || bootstrap || process.argv.includes('--packaged');
const jars = packaged ? readdirSync(`${root}/target`).filter((name) => name.endsWith('.jar')) : [];
if (packaged && jars.length !== 1) throw new Error('Run ./mvnw verify before starting the packaged API.');
const executable = packaged ? (process.env.JAVA_HOME ? `${process.env.JAVA_HOME}/bin/java` : 'java') : './mvnw';
const args = packaged ? ['-jar', `${root}/target/${jars[0]}`, ...(migrate ? ['migrate'] : bootstrap ? [recovery ? 'recover-owner' : 'bootstrap-owner', ...(process.argv.includes('--replace-pending') ? ['--replace-pending'] : [])] : ['--spring.profiles.active=local'])] : ['--batch-mode', 'spring-boot:run', '-Dspring-boot.run.profiles=local'];
const child = spawn(executable, args, {
  cwd: root,
  env: environment,
  stdio: 'inherit',
});
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
