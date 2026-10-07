import test from "node:test";
import assert from "node:assert/strict";
import {
  parse,
  propertyInput,
  tenantInput,
  leaseCreateInput,
  leaseUpdateInput,
  depositInput,
  maintenanceInput,
  registerInput,
  settingsInput,
  aiInput,
} from "../src/server/schemas.ts";
const property = {
  name: " Parkside ",
  address: "1 Street",
  city: "Sofia",
  type: "Apartment",
  bedrooms: "2",
  area: "85.5",
  rent: "850.25",
};
test("form values become typed columns and unknown fields are dropped", () => {
  const values = parse(propertyInput, {
    ...property,
    user_id: "someone-else",
    id: "x",
  });
  assert.deepEqual(values, {
    name: "Parkside",
    address: "1 Street",
    city: "Sofia",
    type: "Apartment",
    bedrooms: 2,
    area: 85.5,
    rent_cents: 85025,
    notes: "",
  });
});
test("the first invalid field explains itself", () => {
  assert.throws(
    () => parse(propertyInput, { ...property, name: "" }),
    /Property name is required/,
  );
  assert.throws(
    () => parse(propertyInput, { ...property, type: "Castle" }),
    /Invalid selection/,
  );
  assert.throws(
    () => parse(tenantInput, { name: "A", email: "not-an-email" }),
    /Invalid email/,
  );
  assert.throws(
    () =>
      parse(registerInput, {
        email: "a@example.com",
        password: "short",
        name: "A",
      }),
    /at least 12 characters/,
  );
  assert.throws(() => parse(propertyInput, undefined), /required/);
});
test("leases check their dates and accept partial updates", () => {
  const lease = {
    property_id: "p",
    tenant_id: "t",
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    rent: "900",
    due_day: "5",
  };
  assert.deepEqual(parse(leaseCreateInput, lease), {
    property_id: "p",
    tenant_id: "t",
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    due_day: 5,
    rent_cents: 90000,
    deposit_cents: 0,
    prorate: 0,
  });
  assert.equal(parse(leaseCreateInput, { ...lease, prorate: "1" }).prorate, 1);
  assert.throws(
    () => parse(leaseCreateInput, { ...lease, end_date: "2025-12-31" }),
    /end must be after its start/,
  );
  assert.deepEqual(parse(leaseUpdateInput, { status: "ended" }), {
    status: "ended",
  });
  assert.deepEqual(parse(leaseUpdateInput, { rent: "875", due_day: 3 }), {
    due_day: 3,
    rent_cents: 87500,
  });
  assert.deepEqual(parse(leaseUpdateInput, { prorate: "0" }), { prorate: 0 });
});
test("deposit records need a receipt before a return, and both return fields", () => {
  assert.deepEqual(
    parse(depositInput, { received_on: "", returned: "", returned_on: "" }),
    {
      deposit_received_on: null,
      deposit_returned_cents: null,
      deposit_returned_on: null,
    },
  );
  assert.deepEqual(
    parse(depositInput, {
      received_on: "2026-01-01",
      returned: "0",
      returned_on: "2027-01-10",
    }),
    {
      deposit_received_on: "2026-01-01",
      deposit_returned_cents: 0,
      deposit_returned_on: "2027-01-10",
    },
  );
  for (const [body, message] of [
    [{ received_on: "2026-01-01", returned: "10" }, /both/],
    [{ returned: "10", returned_on: "2027-01-10" }, /received/],
    [
      { received_on: "2027-02-01", returned: "10", returned_on: "2027-01-10" },
      /before it was received/,
    ],
  ] as const)
    assert.throws(() => parse(depositInput, body), message);
});
test("new maintenance issues default to open", () => {
  assert.equal(
    parse(maintenanceInput, {
      property_id: "p",
      title: "Leak",
      priority: "urgent",
    }).status,
    "open",
  );
});
test("settings accept listed formats and default to UK English", () => {
  const base = { name: "A", currency: "EUR" };
  assert.equal(parse(settingsInput, base).locale, "en-GB");
  assert.equal(
    parse(settingsInput, { ...base, locale: "bg-BG" }).locale,
    "bg-BG",
  );
  assert.throws(() => parse(settingsInput, { ...base, locale: "xx-XX" }));
});
test("assistant history is limited and checked", () => {
  assert.deepEqual(parse(aiInput, { prompt: "Hi" }).history, []);
  const turn = { role: "assistant", content: "Hello" };
  assert.equal(
    parse(aiInput, { prompt: "Hi", history: [turn] }).history.length,
    1,
  );
  assert.throws(
    () => parse(aiInput, { prompt: "Hi", history: Array(7).fill(turn) }),
    /at most six/,
  );
  assert.throws(() =>
    parse(aiInput, {
      prompt: "Hi",
      history: [{ role: "system", content: "x" }],
    }),
  );
});
