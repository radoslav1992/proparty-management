import { localDate } from "../../lib/dates";
import type { Charge, Lease, Workspace } from "../../lib/types";

export const VIEWS = {
  overview: "Overview",
  properties: "Properties",
  tenants: "Tenants",
  leases: "Leases",
  rent: "Rent ledger",
  maintenance: "Maintenance",
  expenses: "Expenses",
  documents: "Documents",
  reports: "Reports",
  assistant: "AI assistant",
  settings: "Settings",
} as const;
export type View = keyof typeof VIEWS;
export const isView = (v: string | null | undefined): v is View =>
  !!v && Object.hasOwn(VIEWS, v);

export const el = {
  root: document.querySelector<HTMLElement>(".workspace")!,
  main: document.querySelector<HTMLElement>("#main")!,
  dialog: document.querySelector<HTMLDialogElement>("#editor")!,
  editor: document.querySelector<HTMLElement>("#editor-content")!,
};
export const demo = el.root.dataset.demo === "true";

const initialView = new URLSearchParams(location.search).get("view");
/** Everything the views read. `data` is set by the first successful load. */
export const app = {
  data: undefined as unknown as Workspace,
  view: (isView(initialView) ? initialView : "overview") as View,
  month: localDate().slice(0, 7),
  query: "",
  filter: "all" as "all" | "occupied" | "vacant",
};

export const today = () => localDate();
export const property = (id: string) =>
  app.data.properties.find((p) => p.id === id);
export const tenant = (id: string) => app.data.tenants.find((t) => t.id === id);
export const lease = (id: string) => app.data.leases.find((l) => l.id === id);
/** The lease that covers today, if any; a booked future lease does not count. */
export const activeLease = (propertyId: string) =>
  app.data.leases.find(
    (l) =>
      l.property_id === propertyId &&
      l.status === "active" &&
      l.start_date <= today() &&
      l.end_date >= today(),
  );
export const sum = <T>(rows: T[], pick: (row: T) => number) =>
  rows.reduce((total, row) => total + (pick(row) || 0), 0);
export const balance = (c: Charge) => c.amount_cents - c.paid_cents;
export const overdueCharges = () =>
  app.data.charges
    .filter((c) => c.paid_cents < c.amount_cents && c.due_date < today())
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
export const daysSince = (d: string) =>
  Math.round((Date.parse(today()) - Date.parse(d)) / 864e5);
export function financial(month: string) {
  const charges = app.data.charges.filter((c) => c.month === month);
  return {
    charges,
    received: sum(
      app.data.payments.filter((p) => p.paid_date.startsWith(month)),
      (p) => p.amount_cents,
    ),
    charged: sum(charges, (c) => c.amount_cents),
    allocated: sum(charges, (c) => c.paid_cents),
    expenses: sum(
      app.data.expenses.filter((e) => e.expense_date.startsWith(month)),
      (e) => e.amount_cents,
    ),
  };
}
export const chargeStatus = (c: Charge) =>
  c.paid_cents >= c.amount_cents
    ? "paid"
    : c.paid_cents > 0
      ? "partial"
      : c.due_date < today()
        ? "overdue"
        : "due";
export const leaseState = (l: Lease) =>
  l.status !== "active"
    ? "ended"
    : l.end_date < today()
      ? "Expired"
      : l.start_date > today()
        ? "Upcoming"
        : "active";
