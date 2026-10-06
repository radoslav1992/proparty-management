import { HttpError, uid } from "../../lib/domain";
import {
  digest,
  token,
  hashPassword,
  verifyPassword,
  rateLimit,
  sessionToken,
  setSessionCookie,
  clearSessionCookies,
} from "../../lib/auth";
import {
  emailConfigured,
  sendPasswordReset,
  sendVerification,
} from "../../lib/email";
import { json, later, readBody, type RequestContext } from "../http";
import { publicPost } from "../router";
import {
  parse,
  loginInput,
  registerInput,
  emailInput,
  resetInput,
  verifyInput,
} from "../schemas";

// Hashed once per isolate so a login for an unknown email costs as much as a real one.
let dummyHash: Promise<string> | undefined;

/** Every sign-in route shares one per-IP limit and reads a JSON body. */
const authRoute = (
  pattern: string,
  handler: (c: RequestContext, body: unknown) => Promise<Response>,
) =>
  publicPost(pattern, async (c) => {
    await rateLimit(
      "auth:ip:" +
        (await digest(c.request.headers.get("cf-connecting-ip") || "local")),
      40,
      900,
    );
    return handler(c, await readBody(c.request));
  });
const limitEmail = async (email: string) =>
  rateLimit("auth:email:" + (await digest(email)), 10, 900);

async function startSession(c: RequestContext, userId: string) {
  const t = token();
  await c.db
    .prepare(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
    )
    .bind(await digest(t), userId, Math.floor(Date.now() / 1000) + 604800)
    .run();
  setSessionCookie(c.ctx.cookies, c.url, t);
  return json({ ok: true });
}

export const authRoutes = [
  authRoute("auth/logout", async (c) => {
    const s = sessionToken(c.ctx.cookies);
    if (s)
      await c.db
        .prepare("DELETE FROM sessions WHERE token_hash=?")
        .bind(await digest(s))
        .run();
    clearSessionCookies(c.ctx.cookies);
    return json({ ok: true });
  }),
  authRoute("auth/reset", async (c, body) => {
    const input = parse(resetInput, body);
    const hash = await hashPassword(input.password);
    const row = await c.db
      .prepare(
        "DELETE FROM reset_tokens WHERE token_hash=? AND expires_at>? RETURNING user_id",
      )
      .bind(await digest(input.token), Math.floor(Date.now() / 1000))
      .first<{ user_id: string }>();
    if (!row)
      throw new HttpError(
        400,
        "This reset link has expired or already been used.",
      );
    // Opening the emailed link also proves the address belongs to the user.
    await c.db.batch([
      c.db
        .prepare(
          "UPDATE users SET password_hash=?,email_verified_at=COALESCE(email_verified_at,CURRENT_TIMESTAMP) WHERE id=?",
        )
        .bind(hash, row.user_id),
      c.db.prepare("DELETE FROM sessions WHERE user_id=?").bind(row.user_id),
      c.db
        .prepare("DELETE FROM reset_tokens WHERE user_id=?")
        .bind(row.user_id),
    ]);
    return json({ ok: true });
  }),
  authRoute("auth/verify", async (c, body) => {
    const input = parse(verifyInput, body);
    const row = await c.db
      .prepare(
        "DELETE FROM verify_tokens WHERE token_hash=? AND expires_at>? RETURNING user_id",
      )
      .bind(await digest(input.token), Math.floor(Date.now() / 1000))
      .first<{ user_id: string }>();
    if (!row)
      throw new HttpError(
        400,
        "This confirmation link has expired or already been used. Send a new one from your workspace.",
      );
    await c.db.batch([
      c.db
        .prepare(
          "UPDATE users SET email_verified_at=COALESCE(email_verified_at,CURRENT_TIMESTAMP) WHERE id=?",
        )
        .bind(row.user_id),
      c.db
        .prepare("DELETE FROM verify_tokens WHERE user_id=?")
        .bind(row.user_id),
    ]);
    return json({ ok: true });
  }),
  authRoute("auth/forgot", async (c, body) => {
    const { email } = parse(emailInput, body);
    await limitEmail(email);
    if (!emailConfigured())
      throw new HttpError(
        503,
        "Password recovery email has not been configured. Contact the site administrator.",
      );
    await rateLimit("auth:forgot:" + (await digest(email)), 3, 3600);
    const u = await c.db
      .prepare("SELECT id FROM users WHERE email=?")
      .bind(email)
      .first<{ id: string }>();
    // The token and email are created after responding, so the reply looks and takes the same whether or not the account exists.
    if (u) later(c.ctx, () => sendPasswordReset(u.id, email, c.url.origin));
    return json({
      ok: true,
      message: "If an account exists, a reset link has been sent.",
    });
  }),
  authRoute("auth/register", async (c, body) => {
    const input = parse(registerInput, body);
    await limitEmail(input.email);
    const id = uid();
    try {
      await c.db
        .prepare(
          "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)",
        )
        .bind(id, input.email, input.name, await hashPassword(input.password))
        .run();
    } catch (err) {
      if (String(err).includes("UNIQUE constraint"))
        throw new HttpError(
          409,
          "An account with this email already exists. Log in or reset your password.",
        );
      throw err;
    }
    if (emailConfigured())
      later(c.ctx, () => sendVerification(id, input.email, c.url.origin));
    return startSession(c, id);
  }),
  authRoute("auth/login", async (c, body) => {
    const input = parse(loginInput, body);
    await limitEmail(input.email);
    const user = await c.db
      .prepare("SELECT id,password_hash FROM users WHERE email=?")
      .bind(input.email)
      .first<{ id: string; password_hash: string }>();
    const valid = await verifyPassword(
      input.password,
      user?.password_hash ??
        (await (dummyHash ??= hashPassword("not a real password"))),
    );
    if (!user || !valid)
      throw new HttpError(401, "Email or password is incorrect.");
    return startSession(c, user.id);
  }),
];
