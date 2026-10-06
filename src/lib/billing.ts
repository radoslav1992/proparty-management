import { bindings } from "./env";
import { HttpError, subscriptionPlan } from "./domain";
import { timingEqual } from "./auth";
// POST when params are given, otherwise GET.
export async function stripe(path: string, params?: Record<string, string>) {
  const key = bindings().STRIPE_SECRET_KEY;
  if (!key)
    throw new HttpError(
      503,
      "Subscriptions are not enabled yet. Your free workspace remains available.",
    );
  const res = await fetch("https://api.stripe.com/v1/" + path, {
    method: params ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      ...(params
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
    },
    body: params && new URLSearchParams(params),
  });
  const data = (await res.json()) as any;
  if (!res.ok)
    throw new HttpError(
      502,
      "The billing provider could not complete this request.",
    );
  return data;
}
export async function webhook(request: Request) {
  const e = bindings();
  if (!e.STRIPE_WEBHOOK_SECRET)
    throw new HttpError(503, "Billing is not configured.");
  const body = await request.text();
  const sig = request.headers.get("stripe-signature") || "";
  const parts = sig.split(",");
  const ts = parts.find((x) => x.startsWith("t="))?.slice(2) || "";
  if (!ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300)
    throw new HttpError(400, "Invalid signature.");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(e.STRIPE_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(ts + "." + body),
    ),
  );
  const expected = Array.from(bytes)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  if (
    !parts.some((x) => x.startsWith("v1=") && timingEqual(expected, x.slice(3)))
  )
    throw new HttpError(400, "Invalid signature.");
  const event = JSON.parse(body);
  if (
    await e.DB.prepare("SELECT id FROM webhook_events WHERE id=?")
      .bind(event.id)
      .first()
  )
    return;
  // Retrieve authoritative current subscription state so late/out-of-order events cannot restore cancelled plans.
  let subId: string | undefined;
  const obj = event.data.object;
  if (event.type === "checkout.session.completed")
    subId =
      typeof obj.subscription === "string"
        ? obj.subscription
        : obj.subscription?.id;
  else if (event.type.startsWith("customer.subscription.")) subId = obj.id;
  if (subId) {
    const sub = await stripe("subscriptions/" + encodeURIComponent(subId));
    const userId = sub.metadata?.user_id;
    if (userId) {
      const plan = subscriptionPlan(
        sub.status,
        sub.items?.data?.[0]?.price?.id,
        {
          landlord: e.STRIPE_PRICE_LANDLORD,
          portfolio: e.STRIPE_PRICE_PORTFOLIO,
        },
      );
      // An event for a replaced subscription must not overwrite the current one; a subscription granting a paid plan takes over.
      await e.DB.prepare(
        "UPDATE users SET plan=?,stripe_customer_id=?,stripe_subscription_id=? WHERE id=? AND (? OR stripe_subscription_id IS NULL OR stripe_subscription_id=?)",
      )
        .bind(
          plan,
          sub.customer,
          sub.id,
          userId,
          plan !== "free" ? 1 : 0,
          sub.id,
        )
        .run();
    }
  }
  await e.DB.prepare("INSERT OR IGNORE INTO webhook_events(id) VALUES(?)")
    .bind(event.id)
    .run();
}
