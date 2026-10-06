import { html } from "lit-html";
import {
  activeLease,
  app,
  balance,
  financial,
  overdueCharges,
  sum,
} from "../state";
import {
  arrow,
  badge,
  btn,
  cash,
  empty,
  heading,
  monthLabel,
  stat,
} from "../ui";
import { propertyCard } from "./properties";

export function overview() {
  const d = app.data;
  const f = financial(app.month);
  const occupied = d.properties.filter((p) => activeLease(p.id)).length;
  const outstanding = sum(d.charges, balance);
  const overdue = overdueCharges();
  const ratio = f.charged ? Math.round((f.allocated / f.charged) * 100) : 0;
  const start = new Date(app.month + "-01T00:00:00Z");
  const months = Array.from({ length: 6 }, (_, i) =>
    new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 5 + i, 1))
      .toISOString()
      .slice(0, 7),
  );
  const history = months.map(financial),
    max = Math.max(1, ...history.flatMap((m) => [m.received, m.expenses]));
  return html`${heading(
      `A little clarity, ${d.user.name.split(" ")[0]}.`,
      "Here’s what’s happening across your rental portfolio.",
      btn("+ Add property", "new-properties"),
    )}
    <div class="stat-grid">
      ${stat(
        "Total properties",
        String(d.properties.length),
        `${occupied} occupied · ${d.properties.length - occupied} vacant`,
        "⌂",
      )}${stat(
        "Rent collected",
        cash(f.received),
        monthLabel(app.month, { month: "long", year: "numeric" }),
        "↗",
      )}${stat(
        "Outstanding rent",
        cash(outstanding),
        overdue.length
          ? `${overdue.length} overdue · ${cash(sum(overdue, balance))}`
          : "Nothing overdue",
        "◷",
      )}${stat(
        "Open maintenance",
        String(d.maintenance.filter((m) => m.status !== "resolved").length),
        "A little attention goes a long way",
        "⚒",
      )}
    </div>
    <div class="dashboard-grid">
      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>Your cash flow</h2>
            <p>A clear view of the last six months</p>
          </div>
          ${badge("6 months")}
        </div>
        <div class="chart">
          <div class="chart-legend">
            <span>Rent collected</span><span>Expenses</span>
          </div>
          <table class="sr-only">
            <caption>
              Rent collected and expenses, last six months
            </caption>
            <thead>
              <tr>
                <th>Month</th>
                <th>Rent collected</th>
                <th>Expenses</th>
              </tr>
            </thead>
            <tbody>
              ${history.map(
                (m, i) =>
                  html`<tr>
                    <td>
                      ${monthLabel(months[i], { month: "long", year: "numeric" })}
                    </td>
                    <td>${cash(m.received)}</td>
                    <td>${cash(m.expenses)}</td>
                  </tr>`,
              )}
            </tbody>
          </table>
          <div class="bar-chart" aria-hidden="true">
            ${history.map(
              (m, i) =>
                html`<div class="bar-group">
                  <div
                    class="bar"
                    style="height:${(m.received / max) * 100}%"
                    title="${months[i]} rent: ${cash(m.received)}"
                  ></div>
                  <div
                    class="bar expense"
                    style="height:${(m.expenses / max) * 100}%"
                    title="${months[i]} expenses: ${cash(m.expenses)}"
                  ></div>
                </div>`,
            )}
          </div>
          <div class="chart-months" aria-hidden="true">
            ${months.map((m) => html`<span>${monthLabel(m, { month: "short" })}</span>`)}
          </div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-head">
          <h2>Rent collection</h2>
          ${badge(monthLabel(app.month, { month: "short" }))}
        </div>
        <div class="collection-card">
          <div class="donut" style="--percent:${ratio}">
            <div>
              <strong>${ratio}%</strong><small>of this month’s charges</small>
            </div>
          </div>
          <div class="collection-details">
            <div>
              <span>Allocated payments</span
              ><strong>${cash(f.allocated)}</strong>
            </div>
            <div>
              <span>Still to collect</span
              ><strong>${cash(f.charged - f.allocated)}</strong>
            </div>
          </div>
        </div>
      </section>
    </div>
    <div class="section-row">
      <h2>
        Your properties <span class="pill-count">${d.properties.length}</span>
      </h2>
      <a href="?view=properties" data-view="properties"
        >View all properties ${arrow}</a
      >
    </div>
    ${
      d.properties.length
        ? html`<div class="property-grid">
            ${d.properties.slice(0, 3).map(propertyCard)}
          </div>`
        : html`<div class="panel">
            ${empty(
              "Make yourself at home.",
              "Add your first rental unit, then connect a tenant and lease to start tracking rent.",
              "Add your first property",
              "new-properties",
            )}
          </div>`
    }
    <div class="ai-nudge">
      <span class="round-icon">✧</span>
      <div>
        <h3>A helpful second pair of eyes.</h3>
        <p>Ask about rent balances, repairs, or your next tenant message.</p>
      </div>
      <button class="button" data-view="assistant">
        Ask your assistant <span aria-hidden="true">↗</span>
      </button>
    </div>`;
}
