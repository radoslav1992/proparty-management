import test from "node:test";
import assert from "node:assert/strict";
import {
  parse,
  propertyInput,
  tenantInput,
  leaseCreateInput,
  leaseUpdateInput,
  maintenanceInput,
  registerInput,
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
  });
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
