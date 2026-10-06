import type { APIContext } from "astro";
import { HttpError } from "../lib/domain";
import { emailConfigured } from "../lib/email";
import type { Bindings } from "../lib/env";
import type { SessionUser } from "../lib/types";

export const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export async function readBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "Invalid request body.");
  }
}

/** Runs work after the response is sent; failures are logged, not shown. */
export function later(ctx: APIContext, task: () => Promise<unknown>) {
  ctx.locals.cfContext.waitUntil(
    task().catch((err) =>
      console.error(
        "Background task failed",
        err instanceof Error ? err.message : "unknown",
      ),
    ),
  );
}

export interface RequestContext {
  ctx: APIContext;
  request: Request;
  url: URL;
  db: D1Database;
  env: Bindings;
}

/** Tables a signed-in user can address by record id. */
export type OwnedTable =
  | "properties"
  | "tenants"
  | "leases"
  | "charges"
  | "payments"
  | "maintenance"
  | "expenses"
  | "files";

export interface UserContext extends RequestContext {
  user: SessionUser;
  userId: string;
  /** Loads a row the current user owns, or fails with 404. */
  owned<T = Record<string, any>>(table: OwnedTable, id: string): Promise<T>;
  /** AI requests and uploads cost money, so they wait for a confirmed email once email is set up. */
  requireVerifiedEmail(): void;
}

export function userContext(base: RequestContext, user: SessionUser) {
  const context: UserContext = {
    ...base,
    user,
    userId: user.id,
    async owned<T>(table: OwnedTable, id: string) {
      const row = await base.db
        .prepare(`SELECT * FROM ${table} WHERE id=? AND user_id=?`)
        .bind(id, user.id)
        .first<T>();
      if (!row) throw new HttpError(404, "Record not found.");
      return row;
    },
    requireVerifiedEmail() {
      if (emailConfigured() && !user.email_verified_at)
        throw new HttpError(
          403,
          "Confirm your email address to use this. Check your inbox, or send a new link from the banner at the top of your workspace.",
        );
    },
  };
  return context;
}

/** Turns thrown errors into JSON responses, translating database constraint failures into plain words. */
export function errorResponse(err: unknown) {
  if (err instanceof HttpError) return json({ error: err.message }, err.status);
  const message = String(err);
  if (message.includes("UNIQUE constraint"))
    return json({ error: "This record already exists." }, 409);
  if (message.includes("overlap an active lease"))
    return json(
      {
        error:
          "These dates overlap another active lease for this property. End or shorten that lease first.",
      },
      409,
    );
  if (message.includes("Charge is voided"))
    return json({ error: "This rent charge has been removed." }, 409);
  if (message.includes("FOREIGN KEY"))
    return json(
      {
        error:
          "This record is linked to other records. Remove those links first.",
      },
      409,
    );
  if (message.includes("Payment exceeds"))
    return json({ error: "Payment exceeds the outstanding balance." }, 409);
  console.error("API failure", err instanceof Error ? err.message : "unknown");
  return json({ error: "Something went wrong. Please try again." }, 500);
}
