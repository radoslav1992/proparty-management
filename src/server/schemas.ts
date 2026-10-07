// Request bodies. Each field reuses the validators in lib/domain, so rules and messages live in one place;
// the schemas add structure, drop unknown keys and give typed results.
import { z } from "astro/zod";
import {
  HttpError,
  text,
  money,
  date,
  month,
  integer,
  choice,
} from "../lib/domain.ts";
import {
  PROPERTY_TYPES,
  EXPENSE_CATEGORIES,
  PRIORITIES,
  MAINTENANCE_STATUSES,
  CURRENCIES,
  LOCALES,
  type Locale,
} from "../lib/types.ts";

// default(undefined) makes Zod 4 run the check for a missing key too, so required fields keep their own messages.
const check = <T>(validate: (value: unknown) => T) =>
  z
    .unknown()
    .default(undefined)
    .transform((value, ctx): T => {
      try {
        return validate(value);
      } catch (err) {
        ctx.addIssue({
          code: "custom",
          message: err instanceof Error ? err.message : "Invalid value.",
        });
        return z.NEVER;
      }
    });
const required = (label: string, max: number) =>
  check((v) => text(v, label, max));
const optional = (label: string, max: number) =>
  check((v) => text(v || "", label, max, false));
const oneOf = <T extends string>(allowed: readonly T[], fallback?: T) =>
  check((v) => choice(v || fallback, [...allowed]) as T);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const recordId = required("Record", 100);
export const password = check((v) => {
  const p = text(v, "Password", 128);
  if (p.length < 12)
    throw new HttpError(400, "Use at least 12 characters for your password.");
  return p;
});
export const emailAddress = check((v) => {
  const email = text(v, "Email", 254).toLowerCase();
  if (!EMAIL.test(email))
    throw new HttpError(400, "Enter a valid email address.");
  return email;
});

export const loginInput = z.object({
  email: emailAddress,
  password: required("Password", 128),
});
export const registerInput = z.object({
  email: emailAddress,
  password,
  name: required("Name", 100),
});
export const emailInput = z.object({ email: emailAddress });
export const resetInput = z.object({
  token: required("Reset token", 100),
  password,
});
export const verifyInput = z.object({
  token: required("Confirmation token", 100),
});
export const passwordChangeInput = z.object({
  current_password: required("Current password", 128),
  password: check((v) => {
    const p = text(v, "New password", 128);
    if (p.length < 12)
      throw new HttpError(400, "Use at least 12 characters for your password.");
    return p;
  }),
});
export const accountDeleteInput = z.object({
  password: required("Password", 128),
  confirm: check((v) => {
    if (v !== "DELETE") throw new HttpError(400, "Type DELETE to confirm.");
    return v;
  }),
});
export const settingsInput = z.object({
  name: required("Name", 100),
  company: optional("Company", 150),
  currency: oneOf(CURRENCIES),
  locale: oneOf(Object.keys(LOCALES) as Locale[], "en-GB"),
});
export const checkoutInput = z.object({
  plan: oneOf(["landlord", "portfolio"] as const),
});
export const monthInput = z.object({ month: check(month) });
export const aiInput = z.object({
  prompt: required("Question", 2000),
  // The last few turns of the conversation, so follow-up questions make sense.
  history: check((v) => {
    if (v == null) return [];
    if (!Array.isArray(v) || v.length > 6)
      throw new HttpError(400, "Send at most six earlier messages.");
    return v.map((m) => ({
      role: choice(m?.role, ["user", "assistant"]) as "user" | "assistant",
      content: text(m?.content, "Message", 4000),
    }));
  }),
});

export const propertyInput = z
  .object({
    name: required("Property name", 150),
    address: required("Address", 250),
    city: required("City", 100),
    type: oneOf(PROPERTY_TYPES),
    bedrooms: check((v) => integer(v, 0, 30)),
    area: check((v) => {
      const n = Number(v || 0);
      if (!Number.isFinite(n) || n < 0 || n > 100000)
        throw new HttpError(400, "Invalid floor area.");
      return n;
    }),
    rent: check((v) => money(v || 0, true)),
    notes: optional("Notes", 3000),
  })
  .transform(({ rent, ...rest }) => ({ ...rest, rent_cents: rent }));
export const tenantInput = z.object({
  name: required("Tenant name", 150),
  email: check((v) => {
    const email = text(v || "", "Email", 254, false);
    if (email && !EMAIL.test(email)) throw new HttpError(400, "Invalid email.");
    return email;
  }),
  phone: optional("Phone", 60),
  notes: optional("Notes", 3000),
});
/** A checkbox sends "1" when ticked; the form's hidden "0" stands for unticked. */
const flag = (v: unknown) => (v === true || v === 1 || v === "1" ? 1 : 0);
export const leaseCreateInput = z
  .object({
    property_id: recordId,
    tenant_id: recordId,
    start_date: check(date),
    end_date: check(date),
    rent: check((v) => money(v)),
    deposit: check((v) => money(v || 0, true)),
    due_day: check((v) => integer(v, 1, 28)),
    prorate: check(flag),
  })
  .refine((l) => l.end_date >= l.start_date, {
    message: "Lease end must be after its start.",
  })
  .transform(({ rent, deposit, ...rest }) => ({
    ...rest,
    rent_cents: rent,
    deposit_cents: deposit,
  }));
/** For partial updates: a missing key stays missing instead of being validated. */
const ifPresent = <T>(validate: (value: unknown) => T) =>
  check((v) => (v === undefined ? undefined : validate(v)));
export const leaseUpdateInput = z
  .object({
    status: ifPresent(
      (v) => choice(v, ["active", "ended"]) as "active" | "ended",
    ),
    end_date: ifPresent(date),
    rent: ifPresent((v) => money(v)),
    deposit: ifPresent((v) => money(v || 0, true)),
    due_day: ifPresent((v) => integer(v, 1, 28)),
    prorate: ifPresent(flag),
  })
  .transform(({ rent, deposit, ...rest }) => {
    const values = { ...rest, rent_cents: rent, deposit_cents: deposit };
    return Object.fromEntries(
      Object.entries(values).filter(([, v]) => v !== undefined),
    ) as Partial<{
      [K in keyof typeof values]: NonNullable<(typeof values)[K]>;
    }>;
  });
export const leaseRenewInput = z
  .object({
    end_date: check(date),
    rent: check((v) => money(v)),
  })
  .transform(({ rent, ...rest }) => ({ ...rest, rent_cents: rent }));
const optionalDate = check((v) => (v ? date(v) : null));
export const depositInput = z
  .object({
    received_on: optionalDate,
    returned: check((v) => (v === "" || v == null ? null : money(v, true))),
    returned_on: optionalDate,
  })
  .refine((d) => (d.returned === null) === (d.returned_on === null), {
    message: "Enter both the amount returned and the date, or neither.",
  })
  .refine((d) => d.returned_on === null || d.received_on !== null, {
    message: "Record when the deposit was received before its return.",
  })
  .refine(
    (d) => !d.received_on || !d.returned_on || d.returned_on >= d.received_on,
    { message: "The deposit cannot be returned before it was received." },
  )
  .transform((d) => ({
    deposit_received_on: d.received_on,
    deposit_returned_cents: d.returned,
    deposit_returned_on: d.returned_on,
  }));
export const paymentInput = z
  .object({
    charge_id: recordId,
    amount: check((v) => money(v)),
    paid_date: check(date),
    reference: optional("Reference", 200),
  })
  .transform(({ amount, ...rest }) => ({ ...rest, amount_cents: amount }));
export const chargeUpdateInput = z
  .object({ amount: check((v) => money(v)), due_date: check(date) })
  .transform(({ amount, due_date }) => ({ amount_cents: amount, due_date }));
export const maintenanceInput = z.object({
  property_id: recordId,
  title: required("Issue title", 200),
  description: optional("Description", 5000),
  priority: oneOf(PRIORITIES),
  status: oneOf(MAINTENANCE_STATUSES, "open"),
  assignee: optional("Assignee", 150),
});
export const expenseInput = z
  .object({
    property_id: recordId,
    title: required("Description", 200),
    category: oneOf(EXPENSE_CATEGORIES),
    amount: check((v) => money(v)),
    expense_date: check(date),
  })
  .transform(({ amount, ...rest }) => ({ ...rest, amount_cents: amount }));

/** Validates a request body against a schema; the first problem becomes a 400 response. */
export function parse<S extends z.ZodType>(schema: S, value: unknown) {
  const result = schema.safeParse(value ?? {});
  if (!result.success)
    throw new HttpError(
      400,
      result.error.issues[0]?.message || "Invalid request.",
    );
  return result.data as z.output<S>;
}
