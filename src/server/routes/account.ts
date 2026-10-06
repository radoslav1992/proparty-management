import { HttpError, planFor, today } from "../../lib/domain";
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
  get("workspace", async (c) => {
    const results = await c.db.batch(
      WORKSPACE_TABLES.map((t) =>
        c.db
          .prepare(
            `SELECT ${t === "files" ? "id,property_id,name,mime,size,kind,created_at" : "*"} FROM ${t} WHERE user_id=?`,
          )
          .bind(c.userId),
      ),
    );
    const usage = await c.db
      .prepare("SELECT count FROM ai_usage WHERE user_id=? AND day=?")
      .bind(c.userId, today())
      .first<{ count: number }>();
    const e = c.env;
    return json({
      ...Object.fromEntries(
        WORKSPACE_TABLES.map((t, i) => [t, results[i].results]),
      ),
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
