import { html } from "lit-html";
import { app, leaseState, property, tenant } from "../state";
import { badge, btn, cash, dateLabel, empty, heading, table } from "../ui";

export function leases() {
  const d = app.data;
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
          d.leases.map(
            (l) =>
              html`<tr>
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
                  ${cash(l.rent_cents)}<small>Due on day ${l.due_day}</small>
                </td>
                <td>${cash(l.deposit_cents)}</td>
                <td>${badge(leaseState(l))}</td>
                <td>
                  ${
                    l.status === "active"
                      ? html`<div class="action-inline">
                          ${btn("Edit", "edit-leases", l.id, "icon-button")}${btn(
                            "End lease",
                            "end-lease",
                            l.id,
                            "icon-button",
                          )}
                        </div>`
                      : "History retained"
                  }
                </td>
              </tr>`,
          ),
        )
      : empty(
          "Put your agreements in order.",
          "Add a property and a tenant first, then create a lease.",
          "Create lease",
          "new-leases",
        )
  }`;
}
