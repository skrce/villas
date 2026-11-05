import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';

process.env.VILLAS_LOCAL_INSTANCE = `e2e-${randomBytes(6).toString('hex')}`;
process.env.VILLAS_LOCAL_USERNAME = 'test';
process.env.VILLAS_LOCAL_PASSWORD = randomBytes(24).toString('hex');
process.env.VILLAS_PORT = '19098';
process.env.VILLAS_API_TARGET = 'http://127.0.0.1:19098';
const { localDatabase, root } = await import('./local-db.mjs');
const database = localDatabase({ create: true });
let activeChild;
let interruptedBy;
let shutdownTimer;
const signalChild = (signal) => {
  if (!activeChild?.pid) return;
  try {
    process.kill(-activeChild.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') console.error(`Could not signal browser-check process: ${error.message}`);
  }
};
const interrupt = (signal) => {
  interruptedBy ??= signal;
  signalChild(signal);
  shutdownTimer ??= setTimeout(() => signalChild('SIGKILL'), 30_000).unref();
};
const onInterrupt = () => interrupt('SIGINT');
const onTerminate = () => interrupt('SIGTERM');
process.on('SIGINT', onInterrupt);
process.on('SIGTERM', onTerminate);
const run = (args, cwd = root) => new Promise((resolve, reject) => {
  if (interruptedBy) return reject(new Error('Browser check interrupted.'));
  const child = spawn(process.execPath, args, { cwd, stdio: 'inherit', detached: true });
  activeChild = child;
  child.once('error', reject);
  child.once('close', (code, signal) => {
    activeChild = undefined;
    clearTimeout(shutdownTimer);
    shutdownTimer = undefined;
    if (interruptedBy || code !== 0) reject(new Error(`Villas browser check ended with ${signal ?? `exit status ${code}`}.`));
    else resolve();
  });
});
try {
  await run(['scripts/dev-db.mjs', 'start']);
  await run(['scripts/dev-db.mjs', 'fixtures']);
  await run(['node_modules/@playwright/test/cli.js', 'test'], `${root}/frontend`);
} catch (error) {
  if (!interruptedBy) console.error(error.message);
  process.exitCode = interruptedBy === 'SIGINT' ? 130 : interruptedBy === 'SIGTERM' ? 143 : 1;
} finally {
  try {
    database.compose(['down', '--volumes']);
    rmSync(`${root}/.local-state/${process.env.VILLAS_LOCAL_INSTANCE}`, { recursive: true });
  } catch (error) {
    console.error(`Browser database cleanup failed. Local state retained for recovery. ${error.message}`);
    process.exitCode = 1;
  } finally {
    clearTimeout(shutdownTimer);
    process.off('SIGINT', onInterrupt);
    process.off('SIGTERM', onTerminate);
  }
}
