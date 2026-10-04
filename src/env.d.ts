/// <reference types="astro/client" />
declare namespace App {
  interface Locals {
    user: {
      id: string;
      name: string;
      email: string;
      plan: string;
      currency: string;
      company: string;
      stripe_customer_id: string | null;
      stripe_subscription_id: string | null;
    } | null;
  }
}
