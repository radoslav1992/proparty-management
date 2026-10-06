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
