import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const base = process.env.TEST_BASE_URL || "http://localhost:8787";
const suffix = Date.now();
async function call(
  path,
  { method = "GET", body, cookie, origin = base, status = 200 } = {},
) {
  const r = await fetch(base + path, {
    method,
    redirect: "manual",
    headers: {
      ...(body instanceof FormData
        ? {}
        : body
          ? { "Content-Type": "application/json" }
          : {}),
      ...(method === "GET" ? {} : { Origin: origin }),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const raw = await r.text();
  assert.equal(r.status, status, `${method} ${path}: ${raw.slice(0, 500)}`);
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = raw;
  }
  return {
    data,
    cookie: r.headers.get("set-cookie")?.split(";")[0],
    headers: r.headers,
  };
}
const a = await call("/api/auth/register", {
  method: "POST",
  body: {
    name: "Test manager A",
    email: `test-a-${suffix}@example.com`,
    password: "A valid test password 123",
  },
});
const b = await call("/api/auth/register", {
  method: "POST",
  body: {
    name: "Test manager B",
    email: `test-b-${suffix}@example.com`,
    password: "A valid test password 123",
  },
});
assert.ok(a.cookie);
assert.ok(b.cookie);
const duplicate = await call("/api/auth/register", {
  method: "POST",
  status: 409,
  body: {
    name: "Test manager A",
    email: `test-a-${suffix}@example.com`,
    password: "A valid test password 123",
  },
});
assert.match(duplicate.data.error, /account with this email already exists/);
await call("/api/workspace", { status: 401 });
await call("/app", { status: 302 });
// Signing in returns to the workspace view that was asked for, and only to the workspace.
const location = async (path, cookie) =>
  (await call(path, { cookie, status: 302 })).headers.get("location");
assert.equal(
  await location("/app?view=rent"),
  "/login?next=%2Fapp%3Fview%3Drent",
);
assert.equal(await location("/login", a.cookie), "/app");
assert.equal(await location("/signup", a.cookie), "/app");
assert.equal(
  await location("/login?next=%2Fapp%3Fview%3Drent", a.cookie),
  "/app?view=rent",
);
for (const next of ["https://evil.example", "//evil.example", "/api/workspace"])
  assert.equal(
    await location("/login?next=" + encodeURIComponent(next), a.cookie),
    "/app",
  );
const p = (
  await call("/api/properties", {
    method: "POST",
    cookie: a.cookie,
    status: 201,
    body: {
      name: "=Formula test",
      address: "1 Test Street",
      city: "Sofia",
      type: "Apartment",
      bedrooms: 2,
      area: 85,
      rent: "850.25",
      notes: "Private property",
    },
  })
).data;
const t = (
  await call("/api/tenants", {
    method: "POST",
    cookie: a.cookie,
    status: 201,
    body: {
      name: "Test tenant",
      email: "tenant@example.com",
      phone: "123",
      notes: "",
    },
  })
).data;
const l = (
  await call("/api/leases", {
    method: "POST",
    cookie: a.cookie,
    status: 201,
    body: {
      property_id: p.id,
      tenant_id: t.id,
      start_date: "2026-01-01",
      end_date: "2026-12-31",
      rent: "850.25",
      deposit: "850",
      due_day: 1,
    },
  })
).data;
await call("/api/leases", {
  method: "POST",
  cookie: b.cookie,
  status: 404,
  body: {
    property_id: p.id,
    tenant_id: t.id,
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    rent: "850.25",
    deposit: "850",
    due_day: 1,
  },
});
await call("/api/charges/generate", {
  method: "POST",
  cookie: a.cookie,
  body: { month: "2026-10" },
});
await call("/api/charges/generate", {
  method: "POST",
  cookie: a.cookie,
  body: { month: "2026-10" },
});
let state = (await call("/api/workspace", { cookie: a.cookie })).data;
assert.equal(state.charges.length, 1);
const charge = state.charges[0];
const pay = (
  await call("/api/payments", {
    method: "POST",
    cookie: a.cookie,
    status: 201,
    body: {
      charge_id: charge.id,
      amount: "300.10",
      paid_date: "2026-10-04",
      reference: "test",
    },
  })
).data;
await call("/api/payments", {
  method: "POST",
  cookie: a.cookie,
  status: 409,
  body: { charge_id: charge.id, amount: "600", paid_date: "2026-10-04" },
});
state = (await call("/api/workspace", { cookie: a.cookie })).data;
assert.equal(state.charges[0].paid_cents, 30010);
await call("/api/payments/" + pay.id, { method: "DELETE", cookie: a.cookie });
state = (await call("/api/workspace", { cookie: a.cookie })).data;
assert.equal(state.charges[0].paid_cents, 0);
await call("/api/payments", {
  method: "POST",
  cookie: a.cookie,
  status: 201,
  body: { charge_id: charge.id, amount: "200", paid_date: "2026-10-31" },
});
await call("/api/maintenance", {
  method: "POST",
  cookie: a.cookie,
  status: 201,
  body: {
    property_id: p.id,
    title: "Leaking tap",
    description: "Repair needed",
    priority: "urgent",
    status: "open",
    assignee: "Plumber",
  },
});
await call("/api/expenses", {
  method: "POST",
  cookie: a.cookie,
  status: 201,
  body: {
    property_id: p.id,
    title: "Tap repair",
    category: "Maintenance",
    amount: "85.50",
    expense_date: "2026-10-04",
  },
});
await call("/api/properties/" + p.id, {
  method: "PATCH",
  cookie: b.cookie,
  status: 404,
  body: { name: "Stolen" },
});
await call("/api/properties/" + p.id, {
  method: "DELETE",
  cookie: b.cookie,
  status: 404,
});
const bs = (await call("/api/workspace", { cookie: b.cookie })).data;
assert.equal(bs.properties.length, 0);
assert.equal(bs.tenants.length, 0);
await call("/api/tenants", {
  method: "POST",
  cookie: a.cookie,
  origin: "https://evil.example",
  body: { name: "CSRF" },
  status: 403,
});
const form = new FormData();
form.set("property_id", p.id);
form.set(
  "file",
  new Blob([await readFile("public/images/ns-img-232.webp")], {
    type: "image/webp",
  }),
  "property.webp",
);
const f = (
  await call("/api/files", {
    method: "POST",
    cookie: a.cookie,
    body: form,
    status: 201,
  })
).data;
await call("/api/files/" + f.id, { cookie: b.cookie, status: 404 });
await call("/api/files/" + f.id, { status: 401 });
const image = await fetch(base + "/api/files/" + f.id, {
  headers: { Cookie: a.cookie },
});
assert.equal(image.status, 200);
assert.equal(image.headers.get("content-type"), "image/webp");
assert.match(image.headers.get("cache-control"), /private, max-age=86400/);
const fresh = await call("/api/workspace", { cookie: a.cookie });
assert.equal(fresh.headers.get("cache-control"), "no-store");
const bad = new FormData();
bad.set("property_id", p.id);
bad.set(
  "file",
  new Blob(['<svg onload="alert(1)"></svg>'], { type: "image/png" }),
  "bad.png",
);
await call("/api/files", {
  method: "POST",
  cookie: a.cookie,
  body: bad,
  status: 400,
});
// A streamed upload with no declared size is refused before its body is read.
const encoded = new Request("http://x", { method: "POST", body: form });
const streamed = await fetch(base + "/api/files", {
  method: "POST",
  duplex: "half",
  headers: {
    Origin: base,
    Cookie: a.cookie,
    "Content-Type": encoded.headers.get("content-type"),
  },
  body: encoded.body,
});
assert.equal(streamed.status, 411);
const csv = (await call("/api/reports?month=2026-10", { cookie: a.cookie }))
  .data;
assert.ok(csv.includes("'=Formula test"));
assert.ok(csv.includes('"200.00","85.50","114.50"'));
await call("/api/files/" + f.id, { method: "DELETE", cookie: a.cookie });
await call("/api/files/" + f.id, { cookie: a.cookie, status: 404 });
await call("/api/settings", {
  method: "PATCH",
  cookie: a.cookie,
  status: 400,
  body: { name: "Test", company: "Test", currency: "USD" },
});
// The next tenant's lease can be entered ahead of time, but not over the current one.
const nextLease = {
  property_id: p.id,
  tenant_id: t.id,
  start_date: "2026-12-01",
  end_date: "2027-06-30",
  rent: "900",
  deposit: "0",
  due_day: 1,
};
await call("/api/leases", {
  method: "POST",
  cookie: a.cookie,
  status: 409,
  body: nextLease,
});
await call("/api/leases", {
  method: "POST",
  cookie: a.cookie,
  status: 201,
  body: { ...nextLease, start_date: "2027-01-01" },
});
// Rent charges can be corrected or removed; removed charges stay removed.
await call("/api/charges/generate", {
  method: "POST",
  cookie: a.cookie,
  body: { month: "2026-12" },
});
state = (await call("/api/workspace", { cookie: a.cookie })).data;
const december = state.charges.find((c) => c.month === "2026-12");
await call("/api/charges/" + december.id, {
  method: "PATCH",
  cookie: b.cookie,
  status: 404,
  body: { amount: "1", due_date: "2026-12-05" },
});
await call("/api/charges/" + december.id, {
  method: "PATCH",
  cookie: a.cookie,
  body: { amount: "700", due_date: "2026-12-05" },
});
state = (await call("/api/workspace", { cookie: a.cookie })).data;
assert.equal(
  state.charges.find((c) => c.id === december.id).amount_cents,
  70000,
);
await call("/api/charges/" + charge.id, {
  method: "DELETE",
  cookie: a.cookie,
  status: 409,
});
await call("/api/charges/" + december.id, {
  method: "DELETE",
  cookie: a.cookie,
});
await call("/api/charges/generate", {
  method: "POST",
  cookie: a.cookie,
  body: { month: "2026-12" },
});
await call("/api/payments", {
  method: "POST",
  cookie: a.cookie,
  status: 409,
  body: { charge_id: december.id, amount: "1", paid_date: "2026-12-05" },
});
state = (await call("/api/workspace", { cookie: a.cookie })).data;
assert.deepEqual(
  state.charges.filter((c) => c.month === "2026-12").map((c) => c.voided),
  [1],
);
// Lease terms can be edited; ending early removes later unpaid charges.
await call("/api/leases/" + l.id, {
  method: "PATCH",
  cookie: a.cookie,
  body: { rent: "875", deposit: "850", due_day: 5, end_date: "2026-12-31" },
});
await call("/api/charges/generate", {
  method: "POST",
  cookie: a.cookie,
  body: { month: "2026-11" },
});
state = (await call("/api/workspace", { cookie: a.cookie })).data;
const november = state.charges.find((c) => c.month === "2026-11");
assert.equal(november.amount_cents, 87500);
assert.equal(november.due_date, "2026-11-05");
await call("/api/leases/" + l.id, {
  method: "PATCH",
  cookie: a.cookie,
  status: 400,
  body: { end_date: "2025-12-31" },
});
await call("/api/leases/" + l.id, {
  method: "PATCH",
  cookie: a.cookie,
  body: { status: "ended", end_date: "2026-10-31" },
});
state = (await call("/api/workspace", { cookie: a.cookie })).data;
assert.deepEqual(
  state.charges
    .filter((c) => c.lease_id === l.id && !c.voided)
    .map((c) => c.month),
  ["2026-10"],
);
// Photos can carry a browser-made thumbnail; anything else sent as one is ignored.
const photo = await readFile("public/images/ns-img-232.webp");
const upload = async (thumb) => {
  const form = new FormData();
  form.set("property_id", p.id);
  form.set("file", new Blob([photo], { type: "image/webp" }), "front.webp");
  form.set("thumb", new Blob([thumb], { type: "image/webp" }), "thumb.webp");
  return (
    await call("/api/files", {
      method: "POST",
      cookie: a.cookie,
      body: form,
      status: 201,
    })
  ).data.id;
};
const withThumb = await upload(photo);
const withoutThumb = await upload("<svg onload=alert(1)>");
state = (await call("/api/workspace", { cookie: a.cookie })).data;
const fileRow = (id) => state.files.find((f) => f.id === id);
assert.equal(fileRow(withThumb).has_thumb, 1);
assert.equal(fileRow(withoutThumb).has_thumb, 0);
for (const id of [withThumb, withoutThumb]) {
  const preview = await fetch(`${base}/api/files/${id}?size=thumb`, {
    headers: { Cookie: a.cookie },
  });
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get("content-type"), "image/webp");
  await call("/api/files/" + id, { method: "DELETE", cookie: a.cookie });
}
// Dates and amounts follow the chosen format; only listed formats are accepted.
await call("/api/settings", {
  method: "PATCH",
  cookie: a.cookie,
  body: {
    name: "Test manager A",
    company: "",
    currency: "EUR",
    locale: "bg-BG",
  },
});
assert.equal(
  (await call("/api/workspace", { cookie: a.cookie })).data.user.locale,
  "bg-BG",
);
await call("/api/settings", {
  method: "PATCH",
  cookie: a.cookie,
  status: 400,
  body: { name: "Test manager A", currency: "EUR", locale: "xx-XX" },
});
// Without Workers AI (local runs) the assistant fails cleanly and gives the request back.
await call("/api/ai", {
  method: "POST",
  cookie: a.cookie,
  status: 400,
  body: {
    prompt: "Hi",
    history: Array(7).fill({ role: "user", content: "Earlier" }),
  },
});
const aiFailure = await call("/api/ai", {
  method: "POST",
  cookie: a.cookie,
  status: 502,
  body: { prompt: "Summarise my rent." },
});
// Server-side failures quote the id that is in the logs and on the response.
const requestId = aiFailure.headers.get("x-request-id");
assert.match(requestId, /^[a-f0-9]{16}$/);
assert.equal(aiFailure.data.requestId, requestId);
assert.ok(aiFailure.data.error.endsWith(`(reference ${requestId})`));
assert.equal(
  (await call("/api/workspace", { cookie: a.cookie })).data.aiUsage,
  0,
);
// Paid-up history older than the window loads on request; unpaid charges always load.
const oldLease = (
  await call("/api/leases", {
    method: "POST",
    cookie: a.cookie,
    status: 201,
    body: { ...nextLease, start_date: "2023-01-01", end_date: "2023-12-31" },
  })
).data;
await call("/api/charges/generate", {
  method: "POST",
  cookie: a.cookie,
  body: { month: "2023-01" },
});
const oldCharge = () =>
  call("/api/workspace", { cookie: a.cookie }).then((r) =>
    r.data.charges.find((c) => c.lease_id === oldLease.id),
  );
const unpaid = await oldCharge();
assert.ok(unpaid, "unpaid charges load whatever their age");
await call("/api/payments", {
  method: "POST",
  cookie: a.cookie,
  status: 201,
  body: { charge_id: unpaid.id, amount: "900", paid_date: "2023-01-05" },
});
assert.equal(await oldCharge(), undefined);
const older = (
  await call("/api/workspace?only=charges,payments&since=2023-01", {
    cookie: a.cookie,
  })
).data;
assert.deepEqual(Object.keys(older).sort(), [
  "charges",
  "payments",
  "windowStart",
]);
assert.ok(older.charges.some((c) => c.id === unpaid.id));
assert.ok(older.payments.some((p) => p.charge_id === unpaid.id));
const statement = (
  await call(`/api/tenants/${t.id}/statement`, { cookie: a.cookie })
).data;
assert.ok(statement.charges.some((c) => c.month === "2023-01"));
assert.ok(statement.payments.some((p) => p.paid_date === "2023-01-05"));
await call(`/api/tenants/${t.id}/statement`, { cookie: b.cookie, status: 404 });
// A property's history covers every month, however old, with the last payment date.
const propertyHistory = (
  await call(`/api/properties/${nextLease.property_id}/history`, {
    cookie: a.cookie,
  })
).data;
const oldEntry = propertyHistory.charges.find((c) => c.id === unpaid.id);
assert.equal(oldEntry.last_paid, "2023-01-05");
assert.equal(oldEntry.tenant, "Test tenant");
assert.ok(propertyHistory.charges.every((c) => !c.voided));
assert.equal(typeof propertyHistory.expenses.total_cents, "number");
await call(`/api/properties/${nextLease.property_id}/history`, {
  cookie: b.cookie,
  status: 404,
});
// Money and lease changes are kept in an account's own history.
const history = (await call("/api/activity", { cookie: a.cookie })).data;
const kinds = history.entries.map((e) => e.entity + ":" + e.action);
for (const kind of [
  "payment:recorded",
  "payment:reversed",
  "charge:changed",
  "charge:voided",
  "lease:changed",
  "lease:ended",
])
  assert.ok(kinds.includes(kind), kind);
assert.equal(
  (await call("/api/activity", { cookie: b.cookie })).data.entries.length,
  0,
);
// Due dates stay inside the lease: moved forward to its start, back to its end.
const property = (name) =>
  call("/api/properties", {
    method: "POST",
    cookie: a.cookie,
    status: 201,
    body: {
      name,
      address: "2 Test Street",
      city: "Sofia",
      type: "Studio",
      bedrooms: 1,
      area: 30,
      rent: "500",
    },
  }).then((r) => r.data);
const leaseOn = (propertyId, start_date, end_date, due_day) =>
  call("/api/leases", {
    method: "POST",
    cookie: a.cookie,
    status: 201,
    body: {
      property_id: propertyId,
      tenant_id: t.id,
      start_date,
      end_date,
      rent: "500",
      deposit: "0",
      due_day,
    },
  }).then((r) => r.data);
const short = await leaseOn(
  (await property("Short stay")).id,
  "2026-10-15",
  "2026-11-10",
  12,
);
for (const month of ["2026-10", "2026-11"])
  await call("/api/charges/generate", {
    method: "POST",
    cookie: a.cookie,
    body: { month },
  });
state = (await call("/api/workspace", { cookie: a.cookie })).data;
assert.deepEqual(
  state.charges
    .filter((c) => c.lease_id === short.id)
    .map((c) => c.due_date)
    .sort(),
  ["2026-10-15", "2026-11-10"],
);
// The daily job ends leases past their last day and creates this month's charges.
const day = (offset) =>
  new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);
const cronProperty = await property("Cron test");
const expired = await leaseOn(cronProperty.id, day(-60), day(-1), 1);
const current = await leaseOn(cronProperty.id, day(0), day(60), 28);
const cron = await fetch(base + "/cdn-cgi/handler/scheduled?cron=17+3+*+*+*");
assert.equal(cron.status, 200);
state = (await call("/api/workspace", { cookie: a.cookie })).data;
assert.equal(state.leases.find((x) => x.id === expired.id).status, "ended");
const thisMonth = day(0).slice(0, 7);
assert.equal(
  state.charges.find((c) => c.lease_id === current.id && c.month === thisMonth)
    ?.due_date,
  [thisMonth + "-28", day(0)].sort().at(-1),
);
// Self-service export and deletion remove only the requesting account.
const leaver = await call("/api/auth/register", {
  method: "POST",
  body: {
    name: "Leaving",
    email: `leaving-${suffix}@example.com`,
    password: "A valid test password 123",
  },
});
const leaverHome = (
  await call("/api/properties", {
    method: "POST",
    cookie: leaver.cookie,
    status: 201,
    body: {
      name: "Leaving flat",
      address: "3 Test Street",
      city: "Sofia",
      type: "Studio",
      bedrooms: 1,
      area: 20,
      rent: "400",
    },
  })
).data;
const leaverFile = new FormData();
leaverFile.set("property_id", leaverHome.id);
leaverFile.set(
  "file",
  new Blob([await readFile("public/images/ns-img-232.webp")], {
    type: "image/webp",
  }),
  "photo.webp",
);
const stored = (
  await call("/api/files", {
    method: "POST",
    cookie: leaver.cookie,
    body: leaverFile,
    status: 201,
  })
).data;
const exported = await call("/api/account/export", { cookie: leaver.cookie });
assert.equal(exported.data.account.email, `leaving-${suffix}@example.com`);
assert.equal(exported.data.properties[0].name, "Leaving flat");
assert.equal(exported.data.files[0].download, "/api/files/" + stored.id);
assert.ok(!JSON.stringify(exported.data).includes('"user_id"'));
assert.ok(!JSON.stringify(exported.data).includes('"key"'));
await call("/api/account/delete", {
  method: "POST",
  cookie: leaver.cookie,
  status: 400,
  body: { password: "wrong password!!", confirm: "DELETE" },
});
await call("/api/account/delete", {
  method: "POST",
  cookie: leaver.cookie,
  status: 400,
  body: { password: "A valid test password 123", confirm: "delete" },
});
await call("/api/account/delete", {
  method: "POST",
  cookie: leaver.cookie,
  body: { password: "A valid test password 123", confirm: "DELETE" },
});
await call("/api/workspace", { cookie: leaver.cookie, status: 401 });
await call("/api/auth/login", {
  method: "POST",
  status: 401,
  body: {
    email: `leaving-${suffix}@example.com`,
    password: "A valid test password 123",
  },
});
assert.equal(
  (await call("/api/workspace", { cookie: b.cookie })).data.user.name,
  "Test manager B",
);
// Account security: password change, other sessions, verification links.
const credentials = {
  email: `test-a-${suffix}@example.com`,
  password: "A valid test password 123",
};
const second = await call("/api/auth/login", {
  method: "POST",
  body: credentials,
});
// A new session lasts seven days from its last use.
assert.match(second.headers.get("set-cookie"), /Max-Age=604800/);
await call("/api/account/password", {
  method: "POST",
  cookie: a.cookie,
  status: 400,
  body: { current_password: "wrong password!!", password: "x".repeat(12) },
});
await call("/api/account/password", {
  method: "POST",
  cookie: a.cookie,
  body: {
    current_password: credentials.password,
    password: "Another valid password 456",
  },
});
await call("/api/workspace", { cookie: second.cookie, status: 401 });
await call("/api/auth/login", {
  method: "POST",
  status: 401,
  body: credentials,
});
await call("/api/auth/login", {
  method: "POST",
  status: 401,
  body: { ...credentials, email: `nobody-${suffix}@example.com` },
});
const third = await call("/api/auth/login", {
  method: "POST",
  body: { ...credentials, password: "Another valid password 456" },
});
const signedOut = await call("/api/account/sign-out-others", {
  method: "POST",
  cookie: a.cookie,
  body: {},
});
assert.equal(signedOut.data.signedOut, 1);
await call("/api/workspace", { cookie: third.cookie, status: 401 });
state = (await call("/api/workspace", { cookie: a.cookie })).data;
assert.equal(state.emailUnverified, false);
await call("/api/auth/verify", {
  method: "POST",
  status: 400,
  body: { token: "0".repeat(64) },
});
// Without Stripe or an email provider these report that they are not set up.
await call("/api/billing/webhook", { method: "POST", status: 503, body: {} });
await call("/api/auth/forgot", {
  method: "POST",
  status: 503,
  body: { email: credentials.email },
});
await call("/api/account/verify-email", {
  method: "POST",
  cookie: a.cookie,
  status: 503,
  body: {},
});
await call("/api/auth/logout", { method: "POST", cookie: a.cookie, body: {} });
await call("/api/workspace", { cookie: a.cookie, status: 401 });
for (const path of [
  "/",
  "/demo",
  "/signup",
  "/login",
  "/privacy",
  "/terms",
  "/verify-email",
])
  await call(path);
// Unknown pages answer 404 at their own address.
assert.match(
  (await call("/no-such-page", { status: 404 })).data,
  /This room is empty/,
);
const landing = (await call("/")).data;
assert.ok(landing.includes(`<link rel="canonical" href="${base}/">`));
assert.ok(
  landing.includes(
    `<meta property="og:image" content="${base}/images/ns-img-223.webp">`,
  ),
);
assert.ok(!(await call("/login")).data.includes("og:title"));
console.log(
  "PASS: registration, protected routes, two-account isolation, leases and overlap rules, charge generation, editing and voiding, partial payment, overpayment guard, reversal, maintenance, expenses, CSRF, R2 upload/ownership/delete, file signature checks, CSV injection safety, currency guard, lease editing and ending, daily job, password change, session sign-out, logout and public pages.",
);
