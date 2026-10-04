import { env } from "cloudflare:workers";
export interface Bindings {
  DB: D1Database;
  PROPERTY_FILES: R2Bucket;
  AI: {
    run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
  };
  AI_MODEL?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_LANDLORD?: string;
  STRIPE_PRICE_PORTFOLIO?: string;
}
export const bindings = () => env as unknown as Bindings;
