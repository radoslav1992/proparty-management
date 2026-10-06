import { bindings } from "./env";
import { HttpError, subscriptionPlan } from "./domain";
import { validStripeSignature } from "./crypto";
// POST when params are given, otherwise GET; pass "DELETE" to cancel a resource.
export async function stripe(
  path: string,
  params?: Record<string, string>,
  method = params ? "POST" : "GET",
) {
  const key = bindings().STRIPE_SECRET_KEY;
  if (!key)
    throw new HttpError(
      503,
      "Subscriptions are not enabled yet. Your free workspace remains available.",
    );
  const res = await fetch("https://api.stripe.com/v1/" + path, {
    method,
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
  if (
    !(await validStripeSignature(
      body,
      request.headers.get("stripe-signature") || "",
      e.STRIPE_WEBHOOK_SECRET,
    ))
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
