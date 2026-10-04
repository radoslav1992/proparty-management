import { spawn } from "node:child_process";
const port = 8891;
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
    "9340",
    "--persist-to",
    process.cwd() + "/.wrangler/state",
    "--local",
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
  const status = await new Promise((resolve) => {
    const test = spawn(process.execPath, ["tests/integration.mjs"], {
      stdio: "inherit",
      env: { ...process.env, TEST_BASE_URL: `http://127.0.0.1:${port}` },
    });
    test.on("exit", resolve);
  });
  if (status !== 0) {
    console.error(output.slice(-10000));
    process.exitCode = 1;
  }
} catch (err) {
  console.error(err.message, output.slice(-7000));
  process.exitCode = 1;
} finally {
  worker.kill("SIGTERM");
}
