import { html } from "lit-html";
import { app, financial, sum } from "../state";
import { btn, cash, empty, heading, monthPicker, stat, table } from "../ui";

function rows() {
  const d = app.data;
  return d.properties.map((p) => {
    const leaseIds = new Set(
      d.leases.filter((l) => l.property_id === p.id).map((l) => l.id),
    );
    const chargeIds = new Set(
      d.charges.filter((c) => leaseIds.has(c.lease_id)).map((c) => c.id),
    );
    const income = sum(
      d.payments.filter(
        (r) => chargeIds.has(r.charge_id) && r.paid_date.startsWith(app.month),
      ),
      (r) => r.amount_cents,
    );
    const spent = sum(
      d.expenses.filter(
        (r) => r.property_id === p.id && r.expense_date.startsWith(app.month),
      ),
      (r) => r.amount_cents,
    );
    return { p, income, spent };
  });
}

export function reports() {
  const f = financial(app.month);
  return html`${heading(
      "The bigger picture, made simple.",
      "Monthly cash-flow statements based on recorded payments and expenses.",
      html`${monthPicker()}${btn("↓ Export CSV", "export-report")}`,
    )}
    <div class="stat-grid">
      ${stat(
        "Rent collected",
        cash(f.received),
        "Based on payment date",
      )}${stat(
        "Total expenses",
        cash(f.expenses),
        "Based on expense date",
      )}${stat(
        "Net cash flow",
        cash(f.received - f.expenses),
        "Collected rent minus expenses",
      )}
    </div>
    ${
      app.data.properties.length
        ? table(
            ["Property", "Rent collected", "Expenses", "Net cash flow"],
            rows().map(
              ({ p, income, spent }) =>
                html`<tr>
                  <td><strong>${p.name}</strong><small>${p.address}</small></td>
                  <td>${cash(income)}</td>
                  <td>${cash(spent)}</td>
                  <td><strong>${cash(income - spent)}</strong></td>
                </tr>`,
            ),
          )
        : empty(
            "Your story is just getting started.",
            "Add properties and record transactions to see your monthly report.",
          )
    }
    <div class="note-box">
      This is a cash-flow report, not a tax return or complete accounting
      statement. Deposits, unrecorded payments, depreciation and mortgage
      principal are not included.
    </div>`;
}
