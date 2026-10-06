import { HttpError, subscriptionEnded } from "../../lib/domain";
import { stripe, webhook } from "../../lib/billing";
import { json, readBody } from "../http";
import { post, publicPost } from "../router";
import { checkoutInput, parse } from "../schemas";

export const billingRoutes = [
  publicPost("billing/webhook", async (c) => {
    await webhook(c.request);
    return json({ received: true });
  }),
  post("billing/checkout", async (c) => {
    const { plan } = parse(checkoutInput, await readBody(c.request));
    const e = c.env,
      user = c.user;
    const price =
      plan === "landlord" ? e.STRIPE_PRICE_LANDLORD : e.STRIPE_PRICE_PORTFOLIO;
    if (!price || !e.STRIPE_WEBHOOK_SECRET)
      throw new HttpError(503, "This plan is not available yet.");
    // Past-due and unpaid subscriptions map to the free plan but still bill, so ask Stripe rather than trusting the local plan.
    if (
      user.stripe_subscription_id &&
      (user.plan !== "free" ||
        !subscriptionEnded(
          (
            await stripe(
              "subscriptions/" +
                encodeURIComponent(user.stripe_subscription_id),
            )
          ).status,
        ))
    )
      throw new HttpError(
        409,
        "Use Manage subscription to change your existing plan.",
      );
    // One Stripe customer per account, so checkouts left open in other tabs can be expired.
    let customer = user.stripe_customer_id;
    if (!customer) {
      const created = await stripe("customers", {
        email: user.email,
        name: user.name,
        "metadata[user_id]": c.userId,
      });
      customer = (await c.db
        .prepare(
          "UPDATE users SET stripe_customer_id=COALESCE(stripe_customer_id,?) WHERE id=? RETURNING stripe_customer_id",
        )
        .bind(created.id, c.userId)
        .first<string>("stripe_customer_id"))!;
    }
    const open = await stripe(
      `checkout/sessions?customer=${encodeURIComponent(customer)}&status=open&limit=10`,
    );
    await Promise.allSettled(
      open.data.map((x: { id: string }) =>
        stripe(`checkout/sessions/${encodeURIComponent(x.id)}/expire`, {}),
      ),
    );
    const session = await stripe("checkout/sessions", {
      mode: "subscription",
      "line_items[0][price]": price,
      "line_items[0][quantity]": "1",
      "subscription_data[metadata][user_id]": c.userId,
      client_reference_id: c.userId,
      customer,
      success_url: c.url.origin + "/app?view=settings&billing=success",
      cancel_url: c.url.origin + "/app?view=settings",
    });
    return json({ url: session.url });
  }),
  post("billing/portal", async (c) => {
    if (!c.user.stripe_customer_id)
      throw new HttpError(400, "No billing account exists yet.");
    const session = await stripe("billing_portal/sessions", {
      customer: c.user.stripe_customer_id,
      return_url: c.url.origin + "/app?view=settings",
    });
    return json({ url: session.url });
  }),
];
