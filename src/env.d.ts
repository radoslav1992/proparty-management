/// <reference types="astro/client" />
type CloudflareRuntime = import("@astrojs/cloudflare").Runtime;
declare namespace App {
  interface Locals extends CloudflareRuntime {
    user: {
      id: string;
      name: string;
      email: string;
      plan: string;
      currency: string;
      company: string;
      stripe_customer_id: string | null;
      stripe_subscription_id: string | null;
      email_verified_at: string | null;
    } | null;
  }
}
