// Runtime-neutral helpers (Web Crypto only), so tests can import them under Node.
export const hex = (b: ArrayBuffer | Uint8Array) =>
  Array.from(b instanceof Uint8Array ? b : new Uint8Array(b))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
export function timingEqual(a: string, b: string) {
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}
// Checks a Stripe-Signature header ("t=…,v1=…") against the raw body. Signatures older than five minutes are rejected.
export async function validStripeSignature(
  body: string,
  header: string,
  secret: string,
  now = Date.now() / 1000,
) {
  const enc = new TextEncoder();
  const parts = header.split(",");
  const ts = parts.find((x) => x.startsWith("t="))?.slice(2) || "";
  if (!/^\d+$/.test(ts) || Math.abs(now - Number(ts)) > 300) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = hex(
    await crypto.subtle.sign("HMAC", key, enc.encode(ts + "." + body)),
  );
  return parts.some(
    (x) => x.startsWith("v1=") && timingEqual(expected, x.slice(3)),
  );
}

// Password hashes are stored as "pbkdf2-sha256$<iterations>$<salt>$<hash>", so the parameters can change later.
// Hashes made before that format are "<salt>:<hash>" at 100,000 iterations and are rewritten at the next sign-in.
/** The Workers runtime refuses PBKDF2 above 100,000 iterations. */
export const PASSWORD_ITERATIONS = 100_000;
export const randomHex = (bytes = 32) =>
  hex(crypto.getRandomValues(new Uint8Array(bytes)));
async function pbkdf2(password: string, salt: string, iterations: number) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return hex(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: enc.encode(salt), iterations, hash: "SHA-256" },
      key,
      256,
    ),
  );
}
export async function hashPassword(
  password: string,
  salt = randomHex(),
  iterations = PASSWORD_ITERATIONS,
) {
  return `pbkdf2-sha256$${iterations}$${salt}$${await pbkdf2(password, salt, iterations)}`;
}
/** Whether the password matches, and whether the stored hash should be replaced with one in the current format. */
export async function checkPassword(password: string, stored: string) {
  const versioned =
    /^pbkdf2-sha256\$(\d+)\$([a-f0-9]{64})\$([a-f0-9]{64})$/.exec(stored);
  const legacy = /^([a-f0-9]{64}):([a-f0-9]{64})$/.exec(stored);
  const iterations = versioned ? Number(versioned[1]) : PASSWORD_ITERATIONS;
  const salt = versioned?.[2] ?? legacy?.[1];
  const expected = versioned?.[3] ?? legacy?.[2];
  if (!salt || !expected || iterations < 1 || iterations > PASSWORD_ITERATIONS)
    return { valid: false, outdated: false };
  return {
    valid: timingEqual(await pbkdf2(password, salt, iterations), expected),
    outdated: !versioned || iterations !== PASSWORD_ITERATIONS,
  };
}

// Sessions last seven days from their last use and never more than 30 days from sign-in.
export const SESSION_IDLE = 7 * 86400,
  SESSION_MAX = 30 * 86400;
/** The new expiry for a session in use, or null when renewing would add less than a day, so an active session is written at most daily. */
export function renewedExpiry(
  now: number,
  expiresAt: number,
  createdAt: number,
) {
  const next = Math.min(now + SESSION_IDLE, createdAt + SESSION_MAX);
  return next - expiresAt >= 86400 ? next : null;
}
