import { html, nothing } from "lit-html";
import type { Lease } from "../../../lib/types";
import { app, leaseState, property, tenant } from "../state";
import { badge, btn, cash, dateLabel, empty, heading, table } from "../ui";

/** Where the deposit stands: held, returned (and how much was kept), or passed on to the renewal. */
function depositNote(l: Lease, renewed: boolean) {
  if (!l.deposit_cents) return "No deposit";
  if (renewed) return "Moved to the renewal";
  if (l.deposit_returned_on) {
    const returned = l.deposit_returned_cents ?? 0,
      kept = l.deposit_cents - returned;
    return `Returned ${cash(returned)} on ${dateLabel(l.deposit_returned_on)}${kept ? ` · ${cash(kept)} kept` : ""}`;
  }
  return l.deposit_received_on
    ? `Held since ${dateLabel(l.deposit_received_on)}`
    : "Not marked as received";
}

export function leases() {
  const d = app.data;
  const renewed = new Set(d.leases.map((l) => l.renewed_from).filter(Boolean));
  return html`${heading(
    "A place for every agreement.",
    "Keep rental dates, deposits and monthly rent connected.",
    btn("+ Create lease", "new-leases"),
  )}
  ${
    d.leases.length
      ? table(
          [
            "Property / tenant",
            "Term",
            "Monthly rent",
            "Deposit",
            "Status",
            "Actions",
          ],
          d.leases.map((l) => {
            const active = l.status === "active",
              wasRenewed = renewed.has(l.id);
            const actions = [
              active && btn("Edit", "edit-leases", l.id, "icon-button"),
              !wasRenewed && btn("Renew", "renew-lease", l.id, "icon-button"),
              l.deposit_cents > 0 &&
                !wasRenewed &&
                btn("Deposit", "lease-deposit", l.id, "icon-button"),
              active && btn("End lease", "end-lease", l.id, "icon-button"),
            ].filter(Boolean);
            return html`<tr>
              <td>
                <strong>${property(l.property_id)?.name}</strong
                ><small>${tenant(l.tenant_id)?.name}</small>
              </td>
              <td>
                ${dateLabel(l.start_date)}<small
                  >to ${dateLabel(l.end_date)}</small
                >
              </td>
              <td>
                ${cash(l.rent_cents)}<small
                  >Due on day
                  ${l.due_day}${l.prorate ? " · prorated" : ""}</small
                >
              </td>
              <td class="note">
                ${cash(l.deposit_cents)}<small
                  >${depositNote(l, wasRenewed)}</small
                >
              </td>
              <td>
                ${badge(leaseState(l))}${
                  l.renewed_from ? html`<small>Renewal</small>` : nothing
                }
              </td>
              <td>
                ${
                  actions.length
                    ? html`<div class="action-inline">${actions}</div>`
                    : "History retained"
                }
              </td>
            </tr>`;
          }),
        )
      : empty(
          "Put your agreements in order.",
          "Add a property and a tenant first, then create a lease.",
          "Create lease",
          "new-leases",
        )
  }`;
}
