import { html } from "lit-html";
import { MAINTENANCE_STATUSES } from "../../../lib/types";
import { app, property } from "../state";
import { arrow, badge, btn, heading } from "../ui";

const COLUMN_TITLES = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
} as const;

export function maintenance() {
  return html`${heading(
      "Keep every repair moving.",
      "From the first report to the final fix.",
      btn("+ Report issue", "new-maintenance"),
    )}
    <div class="kanban">
      ${MAINTENANCE_STATUSES.map((status) => {
        const rows = app.data.maintenance.filter((m) => m.status === status);
        return html`<section class="kanban-column">
          <h2>
            ${COLUMN_TITLES[status]}<span class="pill-count"
              >${rows.length}</span
            >
          </h2>
          ${
            rows.length
              ? rows.map(
                  (m) =>
                    html`<article class="issue-card">
                      ${badge(m.priority)}
                      <h3>${m.title}</h3>
                      <p>${property(m.property_id)?.name}</p>
                      <p>${m.description.slice(0, 120)}</p>
                      <div class="issue-bottom">
                        <span>${m.assignee || "Unassigned"}</span>${btn(
                          html`Open ${arrow}`,
                          "edit-maintenance",
                          m.id,
                          "icon-button",
                        )}
                      </div>
                    </article>`,
                )
              : html`<small>No issues here.</small>`
          }
        </section>`;
      })}
    </div>`;
}
