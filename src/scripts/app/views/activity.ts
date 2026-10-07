import { html, nothing } from "lit-html";
import type { AuditEntry } from "../../../lib/types";
import { api } from "../api";
import { demo } from "../state";
import {
  btn,
  cash,
  dateLabel,
  empty,
  heading,
  locale,
  monthLabel,
  table,
} from "../ui";

/** Loaded when the view opens; cleared whenever workspace data reloads. */
export const activity = {
  entries: [] as AuditEntry[],
  more: false,
  state: "idle" as "idle" | "loading" | "ready" | "failed",
  error: "",
};

export async function loadActivity(rerender: () => void, older = false) {
  if (demo || activity.state === "loading") return;
  const before = older ? activity.entries.at(-1)?.id : undefined;
  activity.state = "loading";
  try {
    const r = await api("activity" + (before ? "?before=" + before : ""));
    activity.entries = older ? [...activity.entries, ...r.entries] : r.entries;
    activity.more = r.more;
    activity.state = "ready";
  } catch (err) {
    activity.state = "failed";
    activity.error = (err as Error).message;
  }
  rerender();
}

const when = (at: string) =>
  new Date(at.replace(" ", "T") + "Z").toLocaleString(locale(), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
type Detail = Record<string, string | number | undefined>;
/** A sentence and the amount it concerns for one history entry. */
export function describe(entry: AuditEntry): [string, number | undefined] {
  const d = JSON.parse(entry.detail) as Detail;
  const month = d.month
    ? monthLabel(String(d.month), { month: "short", year: "numeric" })
    : "";
  const where = [d.property, month].filter(Boolean).join(" · ");
  const who = [d.property, d.tenant].filter(Boolean).join(" · ");
  const money = (key: string) => cash(Number(d[key]));
  switch (`${entry.entity}:${entry.action}`) {
    case "payment:recorded":
      return [
        `Payment recorded${d.reference ? ` (${d.reference})` : ""} · ${where}`,
        Number(d.amount_cents),
      ];
    case "payment:reversed":
      return [`Payment reversed · ${where}`, -Number(d.amount_cents)];
    case "charge:created":
      return [
        `Rent charge created · ${where} · due ${dateLabel(String(d.due_date))}`,
        Number(d.amount_cents),
      ];
    case "charge:changed":
      return [
        `Rent charge changed · ${where} · was ${money("old_amount_cents")} due ${dateLabel(String(d.old_due_date))}, now due ${dateLabel(String(d.due_date))}`,
        Number(d.amount_cents),
      ];
    case "charge:voided":
      return [`Rent charge removed · ${where}`, Number(d.amount_cents)];
    case "charge:deleted":
      return [
        `Unpaid rent charge deleted when the lease was shortened · ${where}`,
        Number(d.amount_cents),
      ];
    case "lease:created":
      return [
        `${d.renewal ? "Lease renewed" : "Lease created"} · ${who} · ${dateLabel(String(d.start_date))} to ${dateLabel(String(d.end_date))}${d.prorate ? " · partial months prorated" : ""}`,
        Number(d.rent_cents),
      ];
    case "lease:deposit":
      if (d.returned_on)
        return [
          `Deposit returned · ${who} · ${dateLabel(String(d.returned_on))}`,
          Number(d.returned_cents),
        ];
      return d.received_on
        ? [
            `Deposit received · ${who} · ${dateLabel(String(d.received_on))}`,
            Number(d.deposit_cents),
          ]
        : [`Deposit record cleared · ${who}`, undefined];
    case "lease:changed": {
      const changes = [
        d.rent_cents !== d.old_rent_cents &&
          `rent ${money("old_rent_cents")} → ${money("rent_cents")}`,
        d.deposit_cents !== d.old_deposit_cents &&
          `deposit ${money("old_deposit_cents")} → ${money("deposit_cents")}`,
        d.due_day !== d.old_due_day &&
          `due day ${d.old_due_day} → ${d.due_day}`,
        d.end_date !== d.old_end_date &&
          `end ${dateLabel(String(d.old_end_date))} → ${dateLabel(String(d.end_date))}`,
      ].filter(Boolean);
      return [`Lease changed · ${who} · ${changes.join(", ")}`, undefined];
    }
    case "lease:ended":
      return [
        `Lease ended · ${who} · last day ${dateLabel(String(d.end_date))}`,
        undefined,
      ];
    default:
      return [`${entry.entity} ${entry.action}`, undefined];
  }
}

export function activityView() {
  const intro = heading(
    "Every change, on the record.",
    "Payments, rent charges and leases, newest first. Entries cannot be edited or deleted.",
  );
  if (demo)
    return html`${intro}${empty(
      "Your history will live here.",
      "In your own workspace, every payment, rent charge and lease change is listed here, including those made by the daily rent job.",
    )}`;
  if (activity.state === "failed")
    return html`${intro}${empty(
      "We couldn’t load your activity",
      activity.error,
      "Try again",
      "reload-activity",
    )}`;
  if (!activity.entries.length)
    return html`${intro}${
      activity.state === "ready"
        ? empty(
            "Nothing recorded yet.",
            "Leases, rent charges and payments appear here as soon as they are created.",
          )
        : html`<div class="loading">
            <span class="spinner"></span>Loading your activity…
          </div>`
    }`;
  return html`${intro}${table(
    ["When", "What happened", "Amount"],
    activity.entries.map((entry) => {
      const [text, amount] = describe(entry);
      return html`<tr>
        <td>${when(entry.at)}</td>
        <td class="wrap">${text}</td>
        <td>${amount === undefined ? "—" : cash(amount)}</td>
      </tr>`;
    }),
  )}${
    activity.more
      ? html`<div class="section-row">
          ${btn("Show older activity", "older-activity", "", "button small outline")}
        </div>`
      : nothing
  }`;
}
