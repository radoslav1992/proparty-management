import { env } from "cloudflare:workers";
export interface Bindings {
  DB: D1Database;
  PROPERTY_FILES: R2Bucket;
  AI: {
    run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
  };
  AI_MODEL?: string;
  /** Cloudflare Email Service; sends only once EMAIL_FROM is set. */
  EMAIL?: SendEmail;
  /** Sender on a domain onboarded to Email Service, e.g. "Proparty <noreply@example.com>". */
  EMAIL_FROM?: string;
  /** Optional address replies go to, e.g. a support@ address forwarded by Email Routing. */
  EMAIL_REPLY_TO?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_LANDLORD?: string;
  STRIPE_PRICE_PORTFOLIO?: string;
}
export const bindings = () => env as unknown as Bindings;
