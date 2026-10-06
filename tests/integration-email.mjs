import assert from "node:assert/strict";
// Runs with an email provider configured (see run-integration.mjs).
const base = process.env.TEST_BASE_URL || "http://localhost:8787";
const suffix = Date.now();
async function call(path, { method = "GET", body, cookie, status = 200 } = {}) {
  const r = await fetch(base + path, {
    method,
    redirect: "manual",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(method === "GET" ? {} : { Origin: base }),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await r.text();
  assert.equal(r.status, status, `${method} ${path}: ${raw.slice(0, 500)}`);
  return {
    data: JSON.parse(raw),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
const email = `verify-${suffix}@example.com`;
const user = await call("/api/auth/register", {
  method: "POST",
  body: { name: "Unverified", email, password: "A valid test password 123" },
});
const state = (await call("/api/workspace", { cookie: user.cookie })).data;
assert.equal(state.emailUnverified, true);
// Paid-for features wait for a confirmed address.
const ai = await call("/api/ai", {
  method: "POST",
  cookie: user.cookie,
  status: 403,
  body: { prompt: "Hello" },
});
assert.match(ai.data.error, /Confirm your email/);
await call("/api/account/verify-email", {
  method: "POST",
  cookie: user.cookie,
  body: {},
});
// Forgot-password answers the same for known and unknown addresses.
const known = await call("/api/auth/forgot", {
  method: "POST",
  body: { email },
});
const unknown = await call("/api/auth/forgot", {
  method: "POST",
  body: { email: `nobody-${suffix}@example.com` },
});
assert.deepEqual(known.data, unknown.data);
console.log(
  "PASS: email verification gate, resend link, uniform forgot-password reply.",
);
