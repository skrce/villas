import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";

const port = (name, fallback) => {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 1024 || value > 65535)
    throw new Error(`Invalid demo port: ${name}.`);
  return value;
};
const uiPort = port("VILLAS_DEMO_UI_PORT", 5173);
const apiPort = port("VILLAS_DEMO_API_PORT", 19098);
const providerPort = port("VILLAS_DEMO_IDP_PORT", 19108);
if (new Set([uiPort, apiPort, providerPort]).size !== 3)
  throw new Error("Demo ports must be distinct.");
Object.assign(process.env, {
  VILLAS_LOCAL_INSTANCE: `demo-${providerPort}`,
  VILLAS_MODE: "local",
  VILLAS_AUTH_PROVIDER: "synthetic",
  VILLAS_GOOGLE_CLIENT_ID: "villas-demo",
  VILLAS_GOOGLE_CLIENT_SECRET: randomBytes(24).toString("hex"),
  VILLAS_INITIAL_OWNER_EMAIL: "owner@example.test",
  VILLAS_PUBLIC_URL: `http://localhost:${uiPort}`,
  VILLAS_SYNTHETIC_ISSUER: `http://127.0.0.1:${providerPort}`,
  VILLAS_PORT: String(apiPort),
  VILLAS_API_TARGET: `http://127.0.0.1:${apiPort}`,
});
const { localDatabase, root } = await import("./local-db.mjs");
const groups = new Set();
const signalErrors = new Map();
const children = new Map();
const groupExists = (pid) => {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    signalErrors.set(pid, error.code ?? error.name);
    return true;
  }
};
let stopping = false;
let interrupted = false;
const signalChildren = (signal) => {
  for (const pid of groups) {
    try {
      process.kill(-pid, signal);
    } catch (error) {
      if (error.code === "ESRCH") groups.delete(pid);
      else signalErrors.set(pid, error.code ?? error.name);
    }
  }
};
const waitForGroups = async (milliseconds) => {
  const deadline = Date.now() + milliseconds;
  do {
    for (const pid of groups)
      if (!groupExists(pid)) {
        groups.delete(pid);
        signalErrors.delete(pid);
      }
    if (!groups.size) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  } while (Date.now() < deadline);
  return false;
};
const interrupt = () => {
  interrupted = true;
  signalChildren("SIGINT");
};
process.on("SIGINT", interrupt);
process.on("SIGTERM", interrupt);
const launch = (args, cwd = root) => {
  if (interrupted) throw new Error("Demo startup interrupted.");
  const child = spawn(process.execPath, args, {
    cwd,
    detached: true,
    stdio: "inherit",
  });
  if (child.pid) groups.add(child.pid);
  const closed = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      children.delete(child);
      if (child.pid && !groupExists(child.pid)) groups.delete(child.pid);
      if (stopping || interrupted || code === 0) resolve();
      else reject(new Error("A demo process stopped. Check its output above."));
    });
  });
  children.set(child, closed);
  return closed;
};
const free = (port) =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", (error) =>
      reject(
        new Error(
          error.code === "EADDRINUSE"
            ? `Demo port ${port} is occupied. Stop its owning app before starting the demo.`
            : `Demo port check failed (${error.code}).`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
const waitFor = async (url, valid) => {
  const deadline = Date.now() + 90_000;
  while (!stopping && !interrupted && Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok && (await valid(response))) return;
    } catch {
      /* Startup may precede the listener. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    "Demo startup could not be confirmed. Check the server output.",
  );
};
const stopped = (worker) =>
  worker.then(() => {
    throw new Error("A demo server stopped. Check its output above.");
  });
let database;
try {
  await Promise.all([uiPort, apiPort, providerPort].map(free));
  database = localDatabase({ create: true });
  await launch(["scripts/dev-db.mjs", "start"]);
  await launch(["scripts/run-api.mjs", "--migrate"]);
  const count = database.sql(
    "SELECT (SELECT COUNT(*) FROM apartments) + (SELECT COUNT(*) FROM customers) + (SELECT COUNT(*) FROM reservations);",
  );
  if (count === "0") await launch(["scripts/dev-db.mjs", "fixtures"]);
  if (database.sql("SELECT COUNT(*) FROM staff_accounts;") === "0") {
    process.env.VILLAS_OWNER_BUSINESS_ID =
      process.env.VILLAS_PROPERTY_ID ?? "villa-rosa";
    await launch(["scripts/run-api.mjs", "--bootstrap-owner"]);
  }
  const provider = launch(["scripts/test-identity-provider.mjs"]);
  const api = launch(["scripts/run-api.mjs", "--packaged"]);
  await Promise.race([
    waitFor(
      `http://127.0.0.1:${apiPort}/api/v1/auth/session`,
      async (response) => (await response.json()).provider === "synthetic",
    ),
    stopped(provider),
    stopped(api),
  ]);
  const ui = launch(
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "localhost",
      "--port",
      String(uiPort),
    ],
    `${root}/frontend`,
  );
  await Promise.race([
    waitFor(`http://localhost:${uiPort}`, async () => true),
    stopped(provider),
    stopped(api),
    stopped(ui),
  ]);
  console.log(
    `Local synthetic Villas demo: http://localhost:${uiPort}. Choose Synthetic Owner. Ctrl+C stops this demo and retains its private database.`,
  );
  await Promise.race([stopped(provider), stopped(api), stopped(ui)]);
} catch (error) {
  if (!interrupted) {
    console.error(error.message);
    process.exitCode = 1;
  }
} finally {
  stopping = true;
  const closed = [...children.values()];
  signalChildren("SIGINT");
  const timer = setTimeout(() => signalChildren("SIGKILL"), 10_000).unref();
  let stopped = await waitForGroups(10_000);
  if (!stopped) {
    signalChildren("SIGKILL");
    stopped = await waitForGroups(5_000);
  }
  clearTimeout(timer);
  if (stopped) await Promise.allSettled(closed);
  else {
    console.error(
      `Shutdown could not be confirmed for ${groups.size} demo process groups${signalErrors.size ? ` (${[...new Set(signalErrors.values())].join(", ")})` : ""}.`,
    );
    process.exitCode = 1;
    for (const child of children.keys()) child.unref();
  }
  if (database) {
    try {
      database.compose(["down"]);
    } catch {
      console.error(
        "Demo database stop could not be confirmed. Its local state is retained.",
      );
      process.exitCode = 1;
    }
  }
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", interrupt);
}
