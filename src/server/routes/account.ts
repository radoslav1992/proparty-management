import { HttpError, month, planFor, today } from "../../lib/domain";
import {
  digest,
  hashPassword,
  verifyPassword,
  rateLimit,
  sessionToken,
} from "../../lib/auth";
import { emailConfigured, sendVerification } from "../../lib/email";
import { json, later, readBody } from "../http";
import { get, patch, post } from "../router";
import { parse, passwordChangeInput, settingsInput } from "../schemas";
import type { AuditEntry } from "../../lib/types";

type WorkspaceTable = (typeof WORKSPACE_TABLES)[number];
// Money tables are limited to the history window; unpaid charges are always included so arrears stay complete.
const WINDOWED = {
  charges: "(due_date>=? OR (voided=0 AND paid_cents<amount_cents))",
  payments: "paid_date>=?",
  expenses: "expense_date>=?",
};
/** First month of the default window: this month and the 23 before it. */
const historyStart = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 23, 1))
    .toISOString()
    .slice(0, 7);
};
const WORKSPACE_TABLES = [
  "properties",
  "tenants",
  "leases",
  "charges",
  "payments",
  "maintenance",
  "expenses",
  "files",
] as const;

export const accountRoutes = [
  // Newest first, 100 at a time; pass ?before=<id> for older entries.
  get("activity", async (c) => {
    const before = Number(c.url.searchParams.get("before")) || 2 ** 53;
    const rows = await c.db
      .prepare(
        "SELECT id,at,entity,entity_id,action,detail FROM audit_log WHERE user_id=? AND id<? ORDER BY id DESC LIMIT 101",
      )
      .bind(c.userId, before)
      .all<AuditEntry>();
    return json({
      entries: rows.results.slice(0, 100),
      more: rows.results.length > 100,
    });
  }),
  // Recent history plus every unpaid charge; older months load on demand with ?since=YYYY-MM.
  // ?only=charges,payments reloads just those collections after a change.
  get("workspace", async (c) => {
    const params = c.url.searchParams;
    const since = params.get("since")
      ? month(params.get("since"))
      : historyStart();
    const only = params
      .get("only")
      ?.split(",")
      .filter((t): t is WorkspaceTable =>
        (WORKSPACE_TABLES as readonly string[]).includes(t),
      );
    const tables = only?.length ? only : WORKSPACE_TABLES;
    const results = await c.db.batch(
      tables.map((t) => {
        const window = WINDOWED[t as keyof typeof WINDOWED];
        return c.db
          .prepare(
            `SELECT ${t === "files" ? "id,property_id,name,mime,size,kind,created_at" : "*"} FROM ${t} WHERE user_id=?${window ? " AND " + window : ""}`,
          )
          .bind(c.userId, ...(window ? [since + "-01"] : []));
      }),
    );
    const collections = Object.fromEntries(
      tables.map((t, i) => [t, results[i].results]),
    );
    if (only?.length) return json({ ...collections, windowStart: since });
    const usage = await c.db
      .prepare("SELECT count FROM ai_usage WHERE user_id=? AND day=?")
      .bind(c.userId, today())
      .first<{ count: number }>();
    const e = c.env;
    return json({
      ...collections,
      windowStart: since,
      user: c.user,
      limits: planFor(c.user.plan),
      aiUsage: usage?.count || 0,
      emailUnverified: emailConfigured() && !c.user.email_verified_at,
      billingEnabled: !!(
        e.STRIPE_SECRET_KEY &&
        e.STRIPE_WEBHOOK_SECRET &&
        e.STRIPE_PRICE_LANDLORD &&
        e.STRIPE_PRICE_PORTFOLIO
      ),
    });
  }),
  // A tenant's full rent history, however old, for statements.
  get("tenants/:id/statement", async (c, { id }) => {
    await c.owned("tenants", id);
    const [charges, payments] = await c.db.batch([
      c.db
        .prepare(
          "SELECT c.id,c.month,c.due_date,c.amount_cents,c.paid_cents,p.name AS property FROM charges c JOIN leases l ON l.id=c.lease_id JOIN properties p ON p.id=l.property_id WHERE c.user_id=? AND l.tenant_id=? AND c.voided=0",
        )
        .bind(c.userId, id),
      c.db
        .prepare(
          "SELECT pay.paid_date,pay.amount_cents,pay.reference FROM payments pay JOIN charges c ON c.id=pay.charge_id JOIN leases l ON l.id=c.lease_id WHERE pay.user_id=? AND l.tenant_id=?",
        )
        .bind(c.userId, id),
    ]);
    return json({ charges: charges.results, payments: payments.results });
  }),
  patch("settings", async (c) => {
    const input = parse(settingsInput, await readBody(c.request));
    if (input.currency !== c.user.currency) {
      const n = await c.db
        .prepare(
          "SELECT (SELECT COUNT(*) FROM properties WHERE user_id=?)+(SELECT COUNT(*) FROM leases WHERE user_id=?) AS n",
        )
        .bind(c.userId, c.userId)
        .first<{ n: number }>();
      if (n?.n)
        throw new HttpError(
          400,
          "Currency cannot change after adding properties. Existing amounts are not converted.",
        );
    }
    await c.db
      .prepare("UPDATE users SET name=?,company=?,currency=? WHERE id=?")
      .bind(input.name, input.company, input.currency, c.userId)
      .run();
    return json({ ok: true });
  }),
  post("account/password", async (c) => {
    const body = await readBody(c.request);
    await rateLimit("account:password:" + c.userId, 10, 900);
    const input = parse(passwordChangeInput, body);
    const row = await c.db
      .prepare("SELECT password_hash FROM users WHERE id=?")
      .bind(c.userId)
      .first<{ password_hash: string }>();
    if (
      !row ||
      !(await verifyPassword(input.current_password, row.password_hash))
    )
      throw new HttpError(400, "Your current password is incorrect.");
    const keep = await digest(sessionToken(c.ctx.cookies) || "");
    await c.db.batch([
      c.db
        .prepare("UPDATE users SET password_hash=? WHERE id=?")
        .bind(await hashPassword(input.password), c.userId),
      c.db
        .prepare("DELETE FROM sessions WHERE user_id=? AND token_hash!=?")
        .bind(c.userId, keep),
      c.db.prepare("DELETE FROM reset_tokens WHERE user_id=?").bind(c.userId),
    ]);
    return json({ ok: true });
  }),
  post("account/sign-out-others", async (c) => {
    const r = await c.db
      .prepare("DELETE FROM sessions WHERE user_id=? AND token_hash!=?")
      .bind(c.userId, await digest(sessionToken(c.ctx.cookies) || ""))
      .run();
    return json({ ok: true, signedOut: r.meta.changes });
  }),
  post("account/verify-email", async (c) => {
    if (c.user.email_verified_at) return json({ ok: true });
    if (!emailConfigured())
      throw new HttpError(
        503,
        "Email has not been configured. Contact the site administrator.",
      );
    await rateLimit("account:verify:" + c.userId, 3, 3600);
    later(c.ctx, () => sendVerification(c.userId, c.user.email, c.url.origin));
    return json({ ok: true });
  }),
];
