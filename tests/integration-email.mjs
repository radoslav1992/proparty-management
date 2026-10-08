import assert from "node:assert/strict";
// Runs with email turned on (see run-integration.mjs). Wrangler simulates Cloudflare Email Service
// locally and keeps every message, so the test reads the links the way a user would.
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
const outbox = "/cdn-cgi/local/explorer/api/local/email/sending";
/** Captured messages to this address with this subject, with their text. Emails go out after the reply, so this polls until `count` have arrived. */
async function mailTo(to, subject, count = 1, attempts = 40) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const found = [];
    let cursor = "";
    do {
      const page = await (
        await fetch(`${base}${outbox}?per_page=100${cursor}`)
      ).json();
      found.push(
        ...page.result.filter(
          (m) => m.to.includes(to) && m.subject === subject,
        ),
      );
      cursor = page.result_info?.has_more
        ? "&cursor=" + encodeURIComponent(page.result_info.cursor)
        : "";
    } while (cursor);
    if (found.length >= count)
      return Promise.all(
        found.map(
          async (m) =>
            (
              await (
                await fetch(
                  `${base}${outbox}?email_id=${encodeURIComponent(m.messageId)}`,
                )
              ).json()
            ).result,
        ),
      );
    if (attempt < attempts - 1)
      await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return [];
}
const tokenIn = (message) => /token=([a-f0-9]{64})/.exec(message.text)?.[1];

const email = `verify-${suffix}@example.com`;
const password = "A valid test password 123";
const user = await call("/api/auth/register", {
  method: "POST",
  body: { name: "Unverified", email, password },
});
assert.equal(
  (await call("/api/workspace", { cookie: user.cookie })).data.emailUnverified,
  true,
);
// Paid-for features wait for a confirmed address.
const ai = await call("/api/ai", {
  method: "POST",
  cookie: user.cookie,
  status: 403,
  body: { prompt: "Hello" },
});
assert.match(ai.data.error, /Confirm your email/);

// The confirmation email comes from the configured sender, with replies to the support address.
const [welcome] = await mailTo(email, "Confirm your Proparty email");
assert.ok(welcome, "a confirmation email is sent on sign-up");
assert.equal(welcome.from, '"Proparty" <noreply@example.com>');
assert.equal(welcome.replyTo, "support@example.com");
assert.ok(welcome.text.includes(`${base}/verify-email?token=`));
// Asking again sends a second link; confirming with either retires both.
await call("/api/account/verify-email", {
  method: "POST",
  cookie: user.cookie,
  body: {},
});
const confirmations = await mailTo(email, "Confirm your Proparty email", 2);
assert.equal(confirmations.length, 2);
const [first, second] = confirmations.map(tokenIn);
assert.notEqual(first, second);
await call("/api/auth/verify", { method: "POST", body: { token: second } });
await call("/api/auth/verify", {
  method: "POST",
  status: 400,
  body: { token: first },
});
assert.equal(
  (await call("/api/workspace", { cookie: user.cookie })).data.emailUnverified,
  false,
);

// Forgot-password answers the same for known and unknown addresses, and mails only the real one.
const nobody = `nobody-${suffix}@example.com`;
const known = await call("/api/auth/forgot", {
  method: "POST",
  body: { email },
});
const unknown = await call("/api/auth/forgot", {
  method: "POST",
  body: { email: nobody },
});
assert.deepEqual(known.data, unknown.data);
const [reset] = await mailTo(email, "Reset your Proparty password");
assert.ok(reset, "a reset email is sent to a known address");
assert.ok(reset.text.includes(`${base}/reset-password?token=`));
// Both requests were answered before the known address's email arrived, so one look is enough.
assert.deepEqual(
  await mailTo(nobody, "Reset your Proparty password", 1, 1),
  [],
);
// The emailed link sets a new password, signs out existing sessions and works only once.
const newPassword = "Another valid password 456";
await call("/api/auth/reset", {
  method: "POST",
  body: { token: tokenIn(reset), password: newPassword },
});
await call("/api/workspace", { cookie: user.cookie, status: 401 });
await call("/api/auth/reset", {
  method: "POST",
  status: 400,
  body: { token: tokenIn(reset), password: newPassword },
});
await call("/api/auth/login", {
  method: "POST",
  status: 401,
  body: { email, password },
});
await call("/api/auth/login", {
  method: "POST",
  body: { email, password: newPassword },
});
console.log(
  "PASS: confirmation email and link, resend, password reset email and link, uniform forgot-password reply.",
);
