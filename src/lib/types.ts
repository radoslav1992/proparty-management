// Rows as stored in D1 and returned by the API. Amounts are integer cents; dates are YYYY-MM-DD strings.
export type Plan = "free" | "landlord" | "portfolio";
export type Currency = "EUR" | "USD" | "GBP";
export const PROPERTY_TYPES = [
  "Apartment",
  "House",
  "Studio",
  "Commercial",
  "Other",
] as const;
export const EXPENSE_CATEGORIES = [
  "Maintenance",
  "Utilities",
  "Insurance",
  "Management",
  "Other",
] as const;
export const PRIORITIES = ["low", "normal", "urgent"] as const;
export const MAINTENANCE_STATUSES = [
  "open",
  "in_progress",
  "resolved",
] as const;
export const CURRENCIES = ["EUR", "USD", "GBP"] as const;

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  plan: string;
  currency: string;
  company: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  email_verified_at: string | null;
}
export interface Property {
  id: string;
  name: string;
  address: string;
  city: string;
  type: (typeof PROPERTY_TYPES)[number];
  bedrooms: number;
  area: number;
  rent_cents: number;
  notes: string;
  created_at?: string;
  /** Sample photo, demo workspace only. */
  demo_image?: string;
}
export interface Tenant {
  id: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
}
export interface Lease {
  id: string;
  property_id: string;
  tenant_id: string;
  start_date: string;
  end_date: string;
  rent_cents: number;
  deposit_cents: number;
  due_day: number;
  status: "active" | "ended";
}
export interface Charge {
  id: string;
  lease_id: string;
  month: string;
  due_date: string;
  amount_cents: number;
  paid_cents: number;
  voided?: number;
}
export interface Payment {
  id: string;
  charge_id: string;
  amount_cents: number;
  paid_date: string;
  reference: string;
}
export interface Maintenance {
  id: string;
  property_id: string;
  title: string;
  description: string;
  priority: (typeof PRIORITIES)[number];
  status: (typeof MAINTENANCE_STATUSES)[number];
  assignee: string;
  created_at: string;
}
export interface Expense {
  id: string;
  property_id: string;
  title: string;
  category: (typeof EXPENSE_CATEGORIES)[number];
  amount_cents: number;
  expense_date: string;
}
export interface FileRecord {
  id: string;
  property_id: string;
  name: string;
  mime: string;
  size: number;
  kind: "image" | "document";
  created_at?: string;
}
export interface PlanLimits {
  properties: number;
  ai: number;
  label: string;
}
export interface Workspace {
  user: Omit<SessionUser, "email_verified_at"> & {
    email_verified_at?: string | null;
  };
  properties: Property[];
  tenants: Tenant[];
  leases: Lease[];
  charges: Charge[];
  payments: Payment[];
  maintenance: Maintenance[];
  expenses: Expense[];
  files: FileRecord[];
  limits: PlanLimits;
  aiUsage: number;
  emailUnverified?: boolean;
  billingEnabled: boolean;
}
