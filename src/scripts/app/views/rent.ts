import { html } from "lit-html";
import {
  app,
  balance,
  chargeStatus,
  daysSince,
  financial,
  lease,
  overdueCharges,
  property,
  sum,
  tenant,
} from "../state";
import {
  badge,
  btn,
  cash,
  dateLabel,
  empty,
  heading,
  monthLabel,
  monthPicker,
  stat,
  table,
} from "../ui";

function arrears() {
  const rows = overdueCharges();
  if (!rows.length)
    return html`<p class="month-caption">No rent is overdue. Nice.</p>`;
  return html`<section class="arrears">
    <div class="section-row">
      <h2>
        Overdue across all months
        <span class="pill-count">${rows.length}</span>
      </h2>
      <strong>${cash(sum(rows, balance))}</strong>
    </div>
    ${table(
      [
        "Property / tenant",
        "Month",
        "Due date",
        "Days overdue",
        "Balance",
        "Action",
      ],
      rows.map((c) => {
        const l = lease(c.lease_id);
        return html`<tr>
          <td>
            <strong>${property(l?.property_id ?? "")?.name}</strong
            ><small>${tenant(l?.tenant_id ?? "")?.name}</small>
          </td>
          <td>${monthLabel(c.month, { month: "short", year: "numeric" })}</td>
          <td>${dateLabel(c.due_date)}</td>
          <td>${daysSince(c.due_date)}</td>
          <td>${cash(balance(c))}</td>
          <td>
            <div class="action-inline">
              ${btn(
                "Record payment",
                "record-payment",
                c.id,
                "button small outline",
              )}${btn(
                "Statement",
                "tenant-statement",
                l?.tenant_id ?? "",
                "icon-button",
              )}
            </div>
          </td>
        </tr>`;
      }),
    )}
  </section>`;
}

export function rent() {
  const d = app.data;
  const f = financial(app.month);
  const payments = d.payments.filter((p) => p.paid_date.startsWith(app.month));
  return html`${heading(
      "Rent, with a clear picture.",
      "Generate charges for active leases. Record payments when they arrive.",
      html`${monthPicker()}${btn("Generate charges", "generate-charges")}`,
    )}${arrears()}
    <div class="stat-grid">
      ${stat(
        "Charged this month",
        cash(f.charged),
        `${f.charges.length} rent charges`,
      )}${stat(
        "Allocated to charges",
        cash(f.allocated),
        "Includes payments on any date",
      )}${stat(
        "Outstanding",
        cash(f.charged - f.allocated),
        "For this month’s charges",
        "◷",
      )}${stat(
        "Cash received",
        cash(f.received),
        "Payments recorded this month",
      )}
    </div>
    <p class="month-caption">
      This month's charges are created automatically each day for active leases.
      Generate other months here; it is safe to repeat. Charges use the full
      lease rent; partial months are not prorated.
    </p>
    ${
      f.charges.length
        ? table(
            [
              "Property / tenant",
              "Due date",
              "Rent",
              "Paid",
              "Balance",
              "Status",
              "Action",
            ],
            f.charges.map((c) => {
              const l = lease(c.lease_id);
              return html`<tr>
                <td>
                  <strong>${property(l?.property_id ?? "")?.name}</strong
                  ><small>${tenant(l?.tenant_id ?? "")?.name}</small>
                </td>
                <td>${dateLabel(c.due_date)}</td>
                <td>${cash(c.amount_cents)}</td>
                <td>${cash(c.paid_cents)}</td>
                <td>${cash(balance(c))}</td>
                <td>${badge(chargeStatus(c))}</td>
                <td>
                  <div class="action-inline">
                    ${
                      c.paid_cents < c.amount_cents
                        ? btn(
                            "Record payment",
                            "record-payment",
                            c.id,
                            "button small outline",
                          )
                        : ""
                    }${btn("Edit", "edit-charges", c.id, "icon-button")}${
                      c.paid_cents === 0
                        ? btn(
                            "Remove",
                            "delete-charges",
                            c.id,
                            "icon-button danger",
                          )
                        : ""
                    }
                  </div>
                </td>
              </tr>`;
            }),
          )
        : empty(
            "Nothing due here yet.",
            "Create an active lease, choose a month and generate its rent charges.",
            "Generate charges",
            "generate-charges",
          )
    }
    <div class="section-row"><h2>Payment history</h2></div>
    ${
      payments.length
        ? table(
            ["Property", "Payment date", "Amount", "Reference", "Actions"],
            payments.map((p) => {
              const c = d.charges.find((c) => c.id === p.charge_id);
              const l = c && lease(c.lease_id);
              return html`<tr>
                <td>${property(l?.property_id ?? "")?.name}</td>
                <td>${dateLabel(p.paid_date)}</td>
                <td>${cash(p.amount_cents)}</td>
                <td>${p.reference || "—"}</td>
                <td>
                  ${btn("Reverse", "delete-payments", p.id, "icon-button danger")}
                </td>
              </tr>`;
            }),
          )
        : html`<p style="font-size:12px">
            No payments recorded in this month.
          </p>`
    }`;
}
