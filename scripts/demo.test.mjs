import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const reserve = () =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
const freePort = async () => {
  const server = await reserve();
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
};
async function probe(
  t,
  { signal = "SIGTERM", failure = "", occupied = false } = {},
) {
  const directory = mkdtempSync(join(tmpdir(), "villas-demo-test-"));
  const log = join(directory, "events.log");
  let runner;
  let finished;
  let blocker;
  t.after(async () => {
    if (runner && runner.exitCode === null && runner.signalCode === null) {
      runner.kill("SIGTERM");
      await finished;
    }
    if (blocker) await new Promise((resolve) => blocker.close(resolve));
    if (existsSync(log))
      for (const entry of readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map(JSON.parse)) {
        if (entry.pid) {
          try {
            process.kill(entry.pid, "SIGKILL");
          } catch (error) {
            if (error.code !== "ESRCH") throw error;
          }
        }
      }
    rmSync(directory, { recursive: true, force: true });
  });
  mkdirSync(join(directory, "scripts"));
  mkdirSync(join(directory, "frontend/node_modules/vite/bin"), {
    recursive: true,
  });
  cpSync(join(root, "scripts/demo.mjs"), join(directory, "scripts/demo.mjs"));
  writeFileSync(
    join(directory, "scripts/local-db.mjs"),
    `import { appendFileSync } from 'node:fs';
export const root = ${JSON.stringify(directory)};
export const localDatabase = () => ({ sql: () => '0', compose: (args) => { appendFileSync(process.env.VILLAS_TEST_LOG, JSON.stringify({type:'database',args})+'\\n'); if(process.env.VILLAS_TEST_FAILURE==='cleanup') throw new Error('Synthetic stop failure'); } });`,
  );
  writeFileSync(
    join(directory, "scripts/dev-db.mjs"),
    `import { appendFileSync } from 'node:fs'; appendFileSync(process.env.VILLAS_TEST_LOG, JSON.stringify({type:'setup',args:process.argv.slice(2)})+'\\n');`,
  );
  const worker = `import { appendFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
const name = process.argv[1].includes('test-identity') ? 'provider' : process.argv[1].includes('vite') ? 'ui' : 'api';
const log = (event) => appendFileSync(process.env.VILLAS_TEST_LOG, JSON.stringify(event)+'\\n');
if(process.argv.includes('--migrate')||process.argv.includes('--bootstrap-owner')) { log({type:'setup',args:process.argv.slice(2)}); }
else if(name==='api' && process.env.VILLAS_TEST_FAILURE==='orphan') { log({type:'ready',name,pid:process.pid}); spawn(process.execPath,[new URL('../api-descendant.mjs',import.meta.url).pathname],{stdio:'inherit'}); setTimeout(()=>process.exit(7),350); }
else { const port = name === 'api' ? Number(process.env.VILLAS_PORT) : name === 'provider' ? Number(new URL(process.env.VILLAS_SYNTHETIC_ISSUER).port) : Number(new URL(process.env.VILLAS_PUBLIC_URL).port); const server = createServer((_request,response)=>{ response.setHeader('Content-Type','application/json'); response.end(JSON.stringify({provider:'synthetic'})); }); server.listen(port,name==='ui'?'localhost':'127.0.0.1'); log({type:'ready',name,pid:process.pid}); process.on('SIGINT',()=>{log({type:'stopped',name});process.exit(0);}); process.on('SIGTERM',()=>{log({type:'stopped',name});process.exit(0);}); if(name==='api'&&process.env.VILLAS_TEST_FAILURE?.startsWith('worker')) setTimeout(()=>process.exit(process.env.VILLAS_TEST_FAILURE==='worker'?7:0),process.env.VILLAS_TEST_FAILURE==='worker'?100:1000); else setInterval(()=>{},1000); }`;
  writeFileSync(
    join(directory, "api-descendant.mjs"),
    `import { appendFileSync } from 'node:fs'; import { createServer } from 'node:http';
createServer((_request,response)=>{response.setHeader('Content-Type','application/json');response.end(JSON.stringify({provider:'synthetic'}));}).listen(Number(process.env.VILLAS_PORT),'127.0.0.1',()=>appendFileSync(process.env.VILLAS_TEST_LOG,JSON.stringify({type:'ready',name:'api-descendant',pid:process.pid})+'\\n'));`,
  );
  for (const path of [
    "scripts/run-api.mjs",
    "scripts/test-identity-provider.mjs",
    "frontend/node_modules/vite/bin/vite.js",
  ])
    writeFileSync(join(directory, path), worker);
  blocker = occupied ? await reserve() : undefined;
  const uiPort = blocker ? blocker.address().port : await freePort();
  const apiPort = await freePort();
  const providerPort = await freePort();
  runner = spawn(process.execPath, ["scripts/demo.mjs"], {
    cwd: directory,
    detached: true,
    env: {
      ...process.env,
      VILLAS_TEST_LOG: log,
      VILLAS_TEST_FAILURE: failure,
      VILLAS_DEMO_UI_PORT: String(uiPort),
      VILLAS_DEMO_API_PORT: String(apiPort),
      VILLAS_DEMO_IDP_PORT: String(providerPort),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  runner.stdout.on("data", (chunk) => {
    output += chunk;
  });
  runner.stderr.on("data", (chunk) => {
    output += chunk;
  });
  finished = new Promise((resolve, reject) => {
    runner.once("error", reject);
    runner.once("close", (code) => resolve(code));
  });
  const events = () =>
    existsSync(log)
      ? readFileSync(log, "utf8")
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line))
      : [];
  if (!occupied && !["worker", "worker-zero", "orphan"].includes(failure)) {
    const deadline = Date.now() + 10_000;
    while (
      events().filter((entry) => entry.type === "ready").length < 3 &&
      runner.exitCode === null &&
      Date.now() < deadline
    )
      await delay(10);
    assert.equal(
      events().filter((entry) => entry.type === "ready").length,
      3,
      output,
    );
    runner.kill(signal);
  }
  const code = await finished;
  assert.equal(code, occupied || failure ? 1 : 0, output);
  if (occupied) {
    assert.match(output, /is occupied/);
    assert.equal(blocker.listening, true);
    assert.deepEqual(events(), []);
    return;
  }
  assert.equal(
    events().filter(
      (entry) => entry.type === "database" && entry.args[0] === "down",
    ).length,
    1,
    output,
  );
  const workers = events().filter((entry) => entry.type === "ready");
  if (failure === "orphan")
    assert.ok(
      workers.some((worker) => worker.name === "api-descendant"),
      output,
    );
  for (const worker of workers)
    assert.throws(() => process.kill(worker.pid, 0), { code: "ESRCH" }, output);
  if (failure === "cleanup")
    assert.match(output, /stop could not be confirmed.*state is retained/i);
}

test("demo SIGINT stops all owned servers and stops its database once", (t) =>
  probe(t, { signal: "SIGINT" }));
test("demo SIGTERM stops all owned servers and stops its database once", (t) =>
  probe(t));
test("demo startup failure stops its other servers", (t) =>
  probe(t, { failure: "worker" }));
test("demo cleanup failure reports retained recovery state", (t) =>
  probe(t, { failure: "cleanup" }));
test("an occupied demo port leaves its existing server untouched", (t) =>
  probe(t, { occupied: true }));

test("demo stops descendants after their launcher exits", (t) =>
  probe(t, { failure: "orphan" }));

test("demo reports an unexpected server exit even with status zero", (t) =>
  probe(t, { failure: "worker-zero" }));
