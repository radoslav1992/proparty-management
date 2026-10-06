import { HttpError, subscriptionEnded } from "../../lib/domain";
import { clearSessionCookies, rateLimit, verifyPassword } from "../../lib/auth";
import { stripe } from "../../lib/billing";
import { json, readBody, type UserContext } from "../http";
import { get, post } from "../router";
import { accountDeleteInput, parse } from "../schemas";

// Account-scoped tables in the export, without internal columns (user_id, storage keys).
const EXPORT_QUERIES = {
  properties:
    "SELECT id,name,address,city,type,bedrooms,area,rent_cents,notes,created_at,updated_at FROM properties WHERE user_id=?",
  tenants:
    "SELECT id,name,email,phone,notes,created_at,updated_at FROM tenants WHERE user_id=?",
  leases:
    "SELECT id,property_id,tenant_id,start_date,end_date,rent_cents,deposit_cents,due_day,status,created_at,updated_at FROM leases WHERE user_id=?",
  charges:
    "SELECT id,lease_id,month,due_date,amount_cents,paid_cents,voided,updated_at FROM charges WHERE user_id=?",
  payments:
    "SELECT id,charge_id,amount_cents,paid_date,reference,created_at FROM payments WHERE user_id=?",
  maintenance:
    "SELECT id,property_id,title,description,priority,status,assignee,created_at,updated_at FROM maintenance WHERE user_id=?",
  expenses:
    "SELECT id,property_id,title,category,amount_cents,expense_date,updated_at FROM expenses WHERE user_id=?",
  files:
    "SELECT id,property_id,name,mime,size,kind,created_at FROM files WHERE user_id=?",
  activity:
    "SELECT at,entity,entity_id,action,detail FROM audit_log WHERE user_id=? ORDER BY id",
} as const;

/** Every R2 object stored for the account, deleted 1,000 keys at a time. */
async function deleteStoredFiles(c: UserContext) {
  let cursor: string | undefined;
  do {
    const page = await c.env.PROPERTY_FILES.list({
      prefix: c.userId + "/",
      cursor,
    });
    if (page.objects.length)
      await c.env.PROPERTY_FILES.delete(page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

export const dataRoutes = [
  get("account/export", async (c) => {
    await rateLimit("account:export:" + c.userId, 10, 3600);
    const tables = Object.keys(
      EXPORT_QUERIES,
    ) as (keyof typeof EXPORT_QUERIES)[];
    const results = await c.db.batch([
      c.db
        .prepare(
          "SELECT name,email,company,currency,plan,created_at FROM users WHERE id=?",
        )
        .bind(c.userId),
      ...tables.map((t) => c.db.prepare(EXPORT_QUERIES[t]).bind(c.userId)),
    ]);
    const data: Record<string, unknown> = {
      exported_at: new Date().toISOString(),
      notes:
        "Amounts are in cents of the account currency. Download each file from its 'download' address while signed in.",
      account: results[0].results[0],
    };
    tables.forEach((t, i) => {
      const rows = results[i + 1].results as Record<string, unknown>[];
      data[t] =
        t === "files"
          ? rows.map((f) => ({ ...f, download: `/api/files/${f.id}` }))
          : t === "activity"
            ? rows.map((r) => ({ ...r, detail: JSON.parse(String(r.detail)) }))
            : rows;
    });
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="proparty-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  }),
  post("account/delete", async (c) => {
    const body = await readBody(c.request);
    await rateLimit("account:delete:" + c.userId, 5, 900);
    const input = parse(accountDeleteInput, body);
    const row = await c.db
      .prepare("SELECT password_hash FROM users WHERE id=?")
      .bind(c.userId)
      .first<{ password_hash: string }>();
    if (!row || !(await verifyPassword(input.password, row.password_hash)))
      throw new HttpError(400, "Your password is incorrect.");
    // Billing must stop before the account disappears; if Stripe cannot confirm, nothing is deleted.
    const subscription = c.user.stripe_subscription_id;
    if (subscription && c.env.STRIPE_SECRET_KEY) {
      const sub = await stripe(
        "subscriptions/" + encodeURIComponent(subscription),
      );
      if (!subscriptionEnded(sub.status))
        await stripe(
          "subscriptions/" + encodeURIComponent(subscription),
          undefined,
          "DELETE",
        );
    }
    await deleteStoredFiles(c);
    // Every account table cascades from users.
    await c.db.prepare("DELETE FROM users WHERE id=?").bind(c.userId).run();
    clearSessionCookies(c.ctx.cookies);
    return json({ ok: true });
  }),
];
