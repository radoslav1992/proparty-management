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
await call("/api/auth/logout", { method: "POST", cookie: a.cookie, body: {} });
await call("/api/workspace", { cookie: a.cookie, status: 401 });
for (const path of ["/", "/demo", "/signup", "/login", "/privacy", "/terms"])
  await call(path);
console.log(
  "PASS: registration, protected routes, two-account isolation, leases, idempotent rent generation, partial payment, overpayment guard, reversal, maintenance, expenses, CSRF, R2 upload/ownership/delete, file signature checks, CSV injection safety, currency guard, lease ending, logout and public pages.",
);
