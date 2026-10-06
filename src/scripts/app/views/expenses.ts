import { html } from "lit-html";
import { app, property, sum } from "../state";
import {
  badge,
  btn,
  cash,
  dateLabel,
  empty,
  heading,
  monthPicker,
  stat,
  table,
} from "../ui";

export function expenses() {
  const rows = app.data.expenses
    .filter((e) => e.expense_date.startsWith(app.month))
    .sort((a, b) => b.expense_date.localeCompare(a.expense_date));
  return html`${heading(
      "Know where your money goes.",
      "Track property costs and keep your cash-flow picture honest.",
      html`${monthPicker()}${btn("+ Add expense", "new-expenses")}`,
    )}
    <div class="stat-grid">
      ${stat(
        "Total expenses",
        cash(sum(rows, (r) => r.amount_cents)),
        app.month,
      )}${stat(
        "Maintenance costs",
        cash(
          sum(
            rows.filter((r) => r.category === "Maintenance"),
            (r) => r.amount_cents,
          ),
        ),
        "Recorded repair expenses",
        "⚒",
      )}
    </div>
    ${
      rows.length
        ? table(
            ["Expense", "Property", "Category", "Date", "Amount", "Actions"],
            rows.map(
              (r) =>
                html`<tr>
                  <td><strong>${r.title}</strong></td>
                  <td>${property(r.property_id)?.name}</td>
                  <td>${badge(r.category)}</td>
                  <td>${dateLabel(r.expense_date)}</td>
                  <td>${cash(r.amount_cents)}</td>
                  <td>
                    <div class="action-inline">
                      ${btn("Edit", "edit-expenses", r.id, "icon-button")}${btn(
                        "Delete",
                        "delete-expenses",
                        r.id,
                        "icon-button danger",
                      )}
                    </div>
                  </td>
                </tr>`,
            ),
          )
        : empty(
            "A clean slate.",
            "Add a repair, utility bill or other property expense for this month.",
            "Add expense",
            "new-expenses",
          )
    }`;
}
