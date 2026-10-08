export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export const plans = {
  free: { properties: 3, ai: 5, label: "Free" },
  landlord: { properties: 15, ai: 30, label: "Landlord" },
  portfolio: { properties: 50, ai: 100, label: "Portfolio" },
};
export const planFor = (plan: string) =>
  plans[plan as keyof typeof plans] || plans.free;
export function text(
  value: unknown,
  label: string,
  max = 200,
  required = true,
) {
  if (
    typeof value !== "string" ||
    (required && !value.trim()) ||
    value.trim().length > max
  )
    throw new HttpError(
      400,
      `${label} is required and must be under ${max} characters.`,
    );
  return value.trim();
}
export function money(value: unknown, allowZero = false) {
  const s = String(value ?? "");
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(s))
    throw new HttpError(
      400,
      "Enter a valid amount with up to two decimal places.",
    );
  const n = Math.round(Number(s) * 100);
  if (n < (allowZero ? 0 : 1) || n > 1000000000)
    throw new HttpError(400, "Amount is outside the allowed range.");
  return n;
}
export function date(value: unknown) {
  const s = text(value, "Date", 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    Number.isNaN(Date.parse(s)) ||
    new Date(s).toISOString().slice(0, 10) !== s
  )
    throw new HttpError(400, "Enter a valid date.");
  return s;
}
export function month(value: unknown) {
  const s = text(value, "Month", 7);
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(s))
    throw new HttpError(400, "Choose a valid month.");
  return s;
}
export function integer(value: unknown, min: number, max: number) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new HttpError(400, `Enter a whole number between ${min} and ${max}.`);
  return n;
}
export function choice(value: unknown, allowed: string[]) {
  if (typeof value !== "string" || !allowed.includes(value))
    throw new HttpError(400, "Invalid selection.");
  return value;
}
export const uid = () => crypto.randomUUID();
export const today = () => new Date().toISOString().slice(0, 10);
export function csvCell(v: unknown) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function subscriptionPlan(
  status: string,
  price: string | undefined,
  prices: { landlord?: string; portfolio?: string },
) {
  if (!price || !["active", "trialing"].includes(status)) return "free";
  return price === prices.portfolio
    ? "portfolio"
    : price === prices.landlord
      ? "landlord"
      : "free";
}
// Past-due and unpaid subscriptions map to the free plan but can still bill, so only these count as finished.
export const subscriptionEnded = (status: string) =>
  ["canceled", "incomplete_expired"].includes(status);

/** "Proparty <noreply@example.com>" or a bare address, as the sender Email Service expects. */
export function senderAddress(value: string) {
  const named = /^\s*(.*?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/.exec(value);
  return named
    ? { name: named[1].replace(/^"|"$/g, "") || "Proparty", email: named[2] }
    : { name: "Proparty", email: value.trim() };
}
