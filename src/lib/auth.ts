import type { AstroCookies } from "astro";
import { bindings } from "./env";
import { HttpError } from "./domain";
import { hex, timingEqual } from "./crypto";
const enc = new TextEncoder();
export const digest = async (s: string) =>
  hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
export const token = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export async function hashPassword(password: string, salt = token()) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return `${salt}:${hex(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256" }, key, 256))}`;
}
export async function verifyPassword(p: string, h: string) {
  return timingEqual(await hashPassword(p, h.split(":")[0]), h);
}
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
export async function sessionUser(cookie: string | undefined) {
  if (!cookie || !/^[a-f0-9]{64}$/.test(cookie)) return null;
  return bindings()
    .DB.prepare(
      "SELECT u.id,u.name,u.email,u.company,u.currency,u.plan,u.stripe_customer_id,u.stripe_subscription_id,u.email_verified_at,u.locale FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
    )
    .bind(await digest(cookie), Math.floor(Date.now() / 1000))
    .first<App.Locals["user"]>();
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
) {
  const secure = url.protocol === "https:";
  cookies.set(secure ? SECURE_COOKIE : PLAIN_COOKIE, value, {
    path: "/",
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: 604800,
  });
}
export function clearSessionCookies(cookies: AstroCookies) {
  cookies.delete(SECURE_COOKIE, { path: "/", secure: true });
  cookies.delete(PLAIN_COOKIE, { path: "/" });
}
