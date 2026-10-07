import { execFileSync, spawn } from "node:child_process";
// Starts the built Worker on its own port, runs test files against it in order, then stops it.
async function run(files, port, inspectorPort, vars = {}) {
  const worker = spawn(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "dev",
      "--config",
      "dist/server/wrangler.json",
      "--port",
      String(port),
      "--ip",
      "127.0.0.1",
      "--inspector-port",
      String(inspectorPort),
      "--persist-to",
      process.cwd() + "/.wrangler/state",
      "--local",
      "--test-scheduled",
      ...Object.entries(vars).flatMap(([k, v]) => ["--var", `${k}:${v}`]),
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Worker startup timed out")),
        45000,
      );
      const handle = (c) => {
        output += c;
        if (output.includes("Ready on")) {
          clearTimeout(timer);
          resolve();
        }
      };
      worker.stdout.on("data", handle);
      worker.stderr.on("data", handle);
      worker.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error("Worker exited: " + code));
      });
    });
    for (const file of files) {
      const status = await new Promise((resolve) => {
        const test = spawn(process.execPath, [file], {
          stdio: "inherit",
          env: { ...process.env, TEST_BASE_URL: `http://127.0.0.1:${port}` },
        });
        test.on("exit", resolve);
      });
      if (status !== 0) {
        console.error(output.slice(-10000));
        return false;
      }
    }
    return true;
  } catch (err) {
    console.error(err.message, output.slice(-7000));
    return false;
  } finally {
    worker.kill("SIGTERM");
  }
}
// Sign-in limits are per IP and last 15 minutes, so back-to-back local runs would trip them.
execFileSync(process.execPath, [
  "node_modules/wrangler/bin/wrangler.js",
  "d1",
  "execute",
  "proparty-management",
  "--local",
  "--persist-to",
  process.cwd() + "/.wrangler/state",
  "--command",
  "DELETE FROM rate_limits",
]);
const results = [
  await run(["tests/integration.mjs", "tests/smoke.mjs"], 8891, 9340),
  // A placeholder email provider turns on verification; sends fail in the background and are only logged.
  await run(["tests/integration-email.mjs"], 8892, 9341, {
    RESEND_API_KEY: "test-key",
    EMAIL_FROM: "Proparty <test@example.com>",
  }),
];
if (results.includes(false)) process.exitCode = 1;
