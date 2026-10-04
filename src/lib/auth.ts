import { bindings } from "./env";
import { HttpError } from "./domain";
const enc = new TextEncoder();
export const hex = (b: ArrayBuffer | Uint8Array) =>
  Array.from(new Uint8Array(b instanceof Uint8Array ? b.buffer : b))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
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
export function timingEqual(a: string, b: string) {
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
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
      "SELECT u.id,u.name,u.email,u.company,u.currency,u.plan,u.stripe_customer_id,u.stripe_subscription_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
    )
    .bind(await digest(cookie), Math.floor(Date.now() / 1000))
    .first<App.Locals["user"]>();
}
