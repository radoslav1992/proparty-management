import type { AstroCookies } from "astro";
import { bindings } from "./env";
import { HttpError } from "./domain";
import type { SessionUser } from "./types";
import {
  checkPassword,
  hex,
  randomHex,
  renewedExpiry,
  SESSION_IDLE,
  SESSION_MAX,
} from "./crypto";
const enc = new TextEncoder();
export const digest = async (s: string) =>
  hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
export const token = () => randomHex();
export { checkPassword, hashPassword } from "./crypto";
export const verifyPassword = async (password: string, stored: string) =>
  (await checkPassword(password, stored)).valid;
export async function rateLimit(key: string, limit: number, seconds: number) {
  const now = Math.floor(Date.now() / 1000);
  const row = await bindings()
    .DB.prepare(
      "INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END, expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING count",
    )
    .bind(key, now + seconds, now, now)
    .first<{ count: number }>();
  if ((row?.count || 0) > limit)
    throw new HttpError(429, "Too many attempts. Please try again later.");
}
// __Host- pins the cookie to this exact origin over HTTPS. Plain-HTTP local runs and sessions issued before the rename use the old name.
const SECURE_COOKIE = "__Host-proparty_session",
  PLAIN_COOKIE = "proparty_session";
export const sessionToken = (cookies: AstroCookies) =>
  cookies.get(SECURE_COOKIE)?.value ?? cookies.get(PLAIN_COOKIE)?.value;
export function setSessionCookie(
  cookies: AstroCookies,
  url: URL,
  value: string,
  maxAge = SESSION_IDLE,
) {
  const secure = url.protocol === "https:";
  cookies.set(secure ? SECURE_COOKIE : PLAIN_COOKIE, value, {
    path: "/",
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge,
  });
}
/** The signed-in user for this request's cookie; a session in use is extended, up to its 30-day limit. */
export async function resumeSession(cookies: AstroCookies, url: URL) {
  const value = sessionToken(cookies);
  if (!value || !/^[a-f0-9]{64}$/.test(value)) return null;
  const db = bindings().DB,
    hash = await digest(value),
    now = Math.floor(Date.now() / 1000);
  const row = await db
    .prepare(
      "SELECT u.id,u.name,u.email,u.company,u.currency,u.plan,u.stripe_customer_id,u.stripe_subscription_id,u.email_verified_at,u.locale,s.expires_at AS session_expires,s.created_at AS session_created FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND s.created_at>?",
    )
    .bind(hash, now, now - SESSION_MAX)
    .first<
      SessionUser & { session_expires: number; session_created: number }
    >();
  if (!row) return null;
  const { session_expires, session_created, ...user } = row;
  const expires = renewedExpiry(now, session_expires, session_created);
  if (expires) {
    await db
      .prepare("UPDATE sessions SET expires_at=? WHERE token_hash=?")
      .bind(expires, hash)
      .run();
    setSessionCookie(cookies, url, value, expires - now);
  }
  return user;
}
export function clearSessionCookies(cookies: AstroCookies) {
  cookies.delete(SECURE_COOKIE, { path: "/", secure: true });
  cookies.delete(PLAIN_COOKIE, { path: "/" });
}
