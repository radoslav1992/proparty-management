import { html } from "lit-html";
import { app, property } from "../state";
import { btn, empty, heading, table } from "../ui";

export function tenants() {
  const d = app.data;
  return html`${heading(
    "People make a property a home.",
    "Keep contact details and notes close at hand.",
    btn("+ Add tenant", "new-tenants"),
  )}
  ${
    d.tenants.length
      ? table(
          ["Tenant", "Email", "Phone", "Rental", "Actions"],
          d.tenants.map((t) => {
            const l = d.leases.find(
              (l) => l.tenant_id === t.id && l.status === "active",
            );
            return html`<tr>
              <td><strong>${t.name}</strong></td>
              <td>${t.email || "—"}</td>
              <td>${t.phone || "—"}</td>
              <td>${l ? property(l.property_id)?.name : "No active lease"}</td>
              <td>
                <div class="action-inline">
                  ${btn("Statement", "tenant-statement", t.id, "icon-button")}${btn(
                    "Edit",
                    "edit-tenants",
                    t.id,
                    "icon-button",
                  )}${btn("Delete", "delete-tenants", t.id, "icon-button danger")}
                </div>
              </td>
            </tr>`;
          }),
        )
      : empty(
          "Your tenant directory starts here.",
          "Add a tenant, then link them to a property with a lease.",
          "Add tenant",
          "new-tenants",
        )
  }`;
}
