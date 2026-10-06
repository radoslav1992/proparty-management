import { HttpError, planFor, uid } from "../../lib/domain";
import type { Lease } from "../../lib/types";
import { json, readBody, type UserContext } from "../http";
import { del, patch, post } from "../router";
import {
  parse,
  propertyInput,
  tenantInput,
  leaseCreateInput,
  leaseUpdateInput,
  paymentInput,
  maintenanceInput,
  expenseInput,
} from "../schemas";

type Table =
  "properties" | "tenants" | "leases" | "payments" | "maintenance" | "expenses";
type Values = Record<string, string | number>;

const insertSql = (table: Table, keys: string[]) =>
  `INSERT INTO ${table}(id,user_id,${keys.join(",")}) VALUES(${["?", "?", ...keys.map(() => "?")].join(",")})`;

async function insert(c: UserContext, table: Table, values: Values) {
  const id = uid();
  await c.db
    .prepare(insertSql(table, Object.keys(values)))
    .bind(id, c.userId, ...Object.values(values))
    .run();
  return json({ id }, 201);
}
function updateStatement(
  c: UserContext,
  table: Table,
  id: string,
  values: Values,
) {
  return c.db
    .prepare(
      `UPDATE ${table} SET ${Object.keys(values)
        .map((k) => k + "=?")
        .join(",")} WHERE id=? AND user_id=?`,
    )
    .bind(...Object.values(values), id, c.userId);
}
async function update(
  c: UserContext,
  table: Table,
  id: string,
  values: Values,
) {
  await updateStatement(c, table, id, values).run();
  return json({ id });
}
async function remove(c: UserContext, table: Table, id: string) {
  await c.db
    .prepare(`DELETE FROM ${table} WHERE id=? AND user_id=?`)
    .bind(id, c.userId)
    .run();
  return json({ ok: true });
}
const body = (c: UserContext) => readBody(c.request);

export const recordRoutes = [
  // Properties: the plan's property limit is enforced in the same statement as the insert.
  post("properties", async (c) => {
    const values: Values = parse(propertyInput, await body(c));
    const keys = Object.keys(values);
    const created = await c.db
      .prepare(
        `INSERT INTO properties(id,user_id,${keys.join(",")}) SELECT ${["?", "?", ...keys.map(() => "?")].join(",")} WHERE (SELECT COUNT(*) FROM properties WHERE user_id=?)<? RETURNING id`,
      )
      .bind(
        uid(),
        c.userId,
        ...Object.values(values),
        c.userId,
        planFor(c.user.plan).properties,
      )
      .first<{ id: string }>();
    if (!created)
      throw new HttpError(
        403,
        "Your plan’s property limit has been reached. Upgrade in Settings.",
      );
    return json({ id: created.id }, 201);
  }),
  patch("properties/:id", async (c, { id }) => {
    await c.owned("properties", id);
    return update(c, "properties", id, parse(propertyInput, await body(c)));
  }),
  del("properties/:id", async (c, { id }) => {
    await c.owned("properties", id);
    const linked = await c.db
      .prepare(
        "SELECT (SELECT COUNT(*) FROM leases WHERE property_id=?)+(SELECT COUNT(*) FROM maintenance WHERE property_id=?)+(SELECT COUNT(*) FROM expenses WHERE property_id=?) AS n",
      )
      .bind(id, id, id)
      .first<{ n: number }>();
    if (linked?.n)
      throw new HttpError(
        409,
        "This property has rental or maintenance history and cannot be deleted.",
      );
    const files = await c.db
      .prepare("SELECT key FROM files WHERE property_id=? AND user_id=?")
      .bind(id, c.userId)
      .all<{ key: string }>();
    await c.db.batch([
      c.db
        .prepare("DELETE FROM files WHERE property_id=? AND user_id=?")
        .bind(id, c.userId),
      c.db
        .prepare("DELETE FROM properties WHERE id=? AND user_id=?")
        .bind(id, c.userId),
    ]);
    if (files.results.length)
      await c.env.PROPERTY_FILES.delete(files.results.map((f) => f.key));
    return json({ ok: true });
  }),

  post("tenants", async (c) =>
    insert(c, "tenants", parse(tenantInput, await body(c))),
  ),
  patch("tenants/:id", async (c, { id }) => {
    await c.owned("tenants", id);
    return update(c, "tenants", id, parse(tenantInput, await body(c)));
  }),
  del("tenants/:id", async (c, { id }) => {
    await c.owned("tenants", id);
    return remove(c, "tenants", id);
  }),

  post("leases", async (c) => {
    const values = parse(leaseCreateInput, await body(c));
    await c.owned("properties", values.property_id);
    await c.owned("tenants", values.tenant_id);
    return insert(c, "leases", values);
  }),
  patch("leases/:id", async (c, { id }) => {
    const lease = await c.owned<Lease>("leases", id);
    const values: Values = parse(leaseUpdateInput, await body(c));
    if (!Object.keys(values).length)
      throw new HttpError(400, "Nothing to update.");
    const end = (values.end_date as string | undefined) ?? lease.end_date;
    if (end < lease.start_date)
      throw new HttpError(400, "Lease end must be after its start.");
    const statements = [updateStatement(c, "leases", id, values)];
    // Unpaid charges after a shortened lease's last month no longer apply. They are deleted, not voided, so extending the lease again regenerates them.
    if (values.end_date)
      statements.push(
        c.db
          .prepare(
            "DELETE FROM charges WHERE lease_id=? AND user_id=? AND month>? AND paid_cents=0",
          )
          .bind(id, c.userId, end.slice(0, 7)),
      );
    await c.db.batch(statements);
    return json({ id });
  }),
  del("leases/:id", async (c, { id }) => {
    await c.owned("leases", id);
    throw new HttpError(
      400,
      "End the lease to preserve its financial history.",
    );
  }),

  post("payments", async (c) => {
    const values = parse(paymentInput, await body(c));
    await c.owned("charges", values.charge_id);
    return insert(c, "payments", values);
  }),
  patch("payments/:id", async (c, { id }) => {
    await c.owned("payments", id);
    throw new HttpError(
      400,
      "Delete an incorrect payment and record a replacement.",
    );
  }),
  del("payments/:id", async (c, { id }) => {
    await c.owned("payments", id);
    return remove(c, "payments", id);
  }),

  post("maintenance", async (c) => {
    const values = parse(maintenanceInput, await body(c));
    await c.owned("properties", values.property_id);
    return insert(c, "maintenance", values);
  }),
  patch("maintenance/:id", async (c, { id }) => {
    await c.owned("maintenance", id);
    const values = parse(maintenanceInput, await body(c));
    await c.owned("properties", values.property_id);
    return update(c, "maintenance", id, values);
  }),
  del("maintenance/:id", async (c, { id }) => {
    await c.owned("maintenance", id);
    return remove(c, "maintenance", id);
  }),

  post("expenses", async (c) => {
    const values = parse(expenseInput, await body(c));
    await c.owned("properties", values.property_id);
    return insert(c, "expenses", values);
  }),
  patch("expenses/:id", async (c, { id }) => {
    await c.owned("expenses", id);
    const values = parse(expenseInput, await body(c));
    await c.owned("properties", values.property_id);
    return update(c, "expenses", id, values);
  }),
  del("expenses/:id", async (c, { id }) => {
    await c.owned("expenses", id);
    return remove(c, "expenses", id);
  }),
];
