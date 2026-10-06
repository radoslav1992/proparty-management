import { html, nothing, render, type TemplateResult } from "lit-html";
import { keyed } from "lit-html/directives/keyed.js";
import { api } from "./api";
import {
  EXPENSE_CATEGORIES,
  PRIORITIES,
  PROPERTY_TYPES,
} from "../../lib/types";
import {
  activeLease,
  app,
  balance,
  demo,
  el,
  lease,
  property,
  sum,
  tenant,
  today,
} from "./state";
import {
  area,
  arrow,
  badge,
  btn,
  cash,
  dateLabel,
  field,
  monthLabel,
  propertySelect,
  select,
  table,
  toast,
} from "./ui";

let modalKey = 0;
/** Each dialog gets fresh DOM, so values typed into a cancelled form never come back. */
export function openModal(content: TemplateResult) {
  render(keyed(++modalKey, content), el.editor);
  if (!el.dialog.open) el.dialog.showModal();
  return modalKey;
}
const intro = (title: string, description: string, cls = "") =>
  html`<div class="editor-heading ${cls}">
    <h2 id="editor-title">${title}</h2>
    <p>${description}</p>
  </div>`;
/** A form the shared submit handler sends to /api/<record>[/<id>]. */
function recordForm(o: {
  title: string;
  description: string;
  record: string;
  id?: string;
  submit: string;
  fields: unknown;
}) {
  openModal(
    html`${intro(o.title, o.description)}
      <form class="record-form" data-record=${o.record} data-id=${o.id ?? ""}>
        ${o.fields}
        <div class="form-message" role="alert"></div>
        <div class="form-actions">
          ${btn("Cancel", "close", "", "button outline")}<button
            class="button"
            type="submit"
          >
            ${o.submit} ${arrow}
          </button>
        </div>
      </form>`,
  );
}
const needsProperty = () => {
  if (app.data.properties.length) return true;
  toast("Add a property first.");
  return false;
};
const currency = () => app.data.user.currency;

export function propertyForm(id = "") {
  const r = property(id);
  recordForm({
    title: r ? "Edit property" : "A new place to call yours.",
    description: "Add one rentable unit per property.",
    record: "properties",
    id: r?.id,
    submit: "Save property",
    fields: html`${field("Property name", "name", r?.name, {
        maxlength: 150,
        placeholder: "The Parkside Apartment",
      })}${field("Street address", "address", r?.address, { maxlength: 250 })}
      <div class="form-grid">
        ${field("City", "city", r?.city, { maxlength: 100 })}${select(
          "Property type",
          "type",
          PROPERTY_TYPES.map((t) => [t, t] as const),
          r?.type || "Apartment",
        )}
      </div>
      <div class="form-grid">
        ${field("Bedrooms", "bedrooms", r?.bedrooms ?? 1, {
          type: "number",
          min: 0,
          max: 30,
        })}${field("Floor area (m²)", "area", r?.area ?? 0, {
          type: "number",
          min: 0,
          max: 100000,
          step: "0.1",
        })}
      </div>
      ${field(
        `Advertised monthly rent (${currency()})`,
        "rent",
        r?.rent_cents ? r.rent_cents / 100 : 0,
        { type: "number", min: 0, step: "0.01" },
      )}${area("Notes", "notes", r?.notes)}`,
  });
}

export function tenantForm(id = "") {
  const r = tenant(id);
  recordForm({
    title: r ? "Edit tenant" : "Make an introduction.",
    description: "Keep contact information in one easy-to-find place.",
    record: "tenants",
    id: r?.id,
    submit: "Save record",
    fields: html`${field("Full name", "name", r?.name, { maxlength: 150 })}${field(
      "Email",
      "email",
      r?.email,
      { type: "email", required: false, maxlength: 254 },
    )}${field("Phone", "phone", r?.phone, {
      type: "tel",
      required: false,
      maxlength: 60,
    })}${area("Notes", "notes", r?.notes)}`,
  });
}

export function leaseForm(id = "") {
  const r = lease(id);
  if (r) {
    recordForm({
      title: "Edit lease",
      description: `${property(r.property_id)?.name} · ${tenant(r.tenant_id)?.name}`,
      record: "leases",
      id: r.id,
      submit: "Save lease",
      fields: html`<div class="form-grid">
          ${field(`Monthly rent (${currency()})`, "rent", r.rent_cents / 100, {
            type: "number",
            min: 0.01,
            step: "0.01",
          })}${field(
            `Deposit (${currency()})`,
            "deposit",
            r.deposit_cents / 100,
            { type: "number", min: 0, step: "0.01" },
          )}
        </div>
        <div class="form-grid">
          ${field("Rent due on day of month", "due_day", r.due_day, {
            type: "number",
            min: 1,
            max: 28,
          })}${field("End date", "end_date", r.end_date, {
            type: "date",
            min: r.start_date,
          })}
        </div>
        <small
          >New rent applies to charges generated from now on; edit existing
          charges in the Rent ledger. Unpaid charges after a shortened end date
          are removed.</small
        >`,
    });
    return;
  }
  if (!needsProperty()) return;
  if (!app.data.tenants.length) {
    toast("Add a tenant first.");
    return;
  }
  const first = app.data.properties[0];
  recordForm({
    title: "Connect the details.",
    description: "Create an agreement between a property and a tenant.",
    record: "leases",
    submit: "Save lease",
    fields: html`${propertySelect(first.id)}${select(
        "Tenant",
        "tenant_id",
        app.data.tenants.map((t) => [t.id, t.name] as const),
      )}
      <div class="form-grid">
        ${field("Start date", "start_date", today(), {
          type: "date",
        })}${field("End date", "end_date", "", { type: "date" })}
      </div>
      <div class="form-grid">
        ${field(
          `Monthly rent (${currency()})`,
          "rent",
          first.rent_cents / 100 || "",
          { type: "number", min: 0.01, step: "0.01" },
        )}${field(`Deposit (${currency()})`, "deposit", 0, {
          type: "number",
          min: 0,
          step: "0.01",
        })}
      </div>
      ${field("Rent due on day of month", "due_day", 1, {
        type: "number",
        min: 1,
        max: 28,
      })}<small
        >Charges use full monthly rent, including first and last months. You can
        add the next tenant's lease before the current one ends, as long as the
        dates do not overlap.</small
      >`,
  });
}

export function endLeaseForm(id: string) {
  const l = lease(id);
  if (!l) return;
  const last = [today(), l.end_date].sort()[0];
  recordForm({
    title: "End this lease?",
    description: `${property(l.property_id)?.name} · ${tenant(l.tenant_id)?.name}`,
    record: "leases",
    id: l.id,
    submit: "End lease",
    fields: html`<input type="hidden" name="status" value="ended" />${field(
        "Last day of the tenancy",
        "end_date",
        last < l.start_date ? l.start_date : last,
        { type: "date", min: l.start_date, max: l.end_date },
      )}<small
        >Charges and payments so far are kept. Unpaid charges for months after
        this date are removed, and no new ones are generated.</small
      >`,
  });
}

export function chargeForm(id: string) {
  const r = app.data.charges.find((c) => c.id === id);
  if (!r) return;
  const l = lease(r.lease_id);
  recordForm({
    title: "Edit rent charge",
    description: `${property(l?.property_id ?? "")?.name} · ${tenant(l?.tenant_id ?? "")?.name} · ${monthLabel(r.month, { month: "long", year: "numeric" })}`,
    record: "charges",
    id: r.id,
    submit: "Save charge",
    fields: html`<div class="form-grid">
        ${field(`Amount (${currency()})`, "amount", r.amount_cents / 100, {
          type: "number",
          min: Math.max(r.paid_cents / 100, 0.01),
          step: "0.01",
        })}${field("Due date", "due_date", r.due_date, { type: "date" })}
      </div>
      ${
        r.paid_cents
          ? html`<small
              >${cash(r.paid_cents)} has already been paid, so the amount cannot
              go below that.</small
            >`
          : nothing
      }`,
  });
}

export function paymentForm(chargeId: string) {
  const c = app.data.charges.find((c) => c.id === chargeId);
  if (!c) return;
  const due = balance(c) / 100;
  recordForm({
    title: "A payment received.",
    description: `${property(lease(c.lease_id)?.property_id ?? "")?.name} · ${cash(balance(c))} outstanding`,
    record: "payments",
    submit: "Save payment",
    fields: html`<input type="hidden" name="charge_id" value=${c.id} />${field(
        `Amount received (${currency()})`,
        "amount",
        due,
        { type: "number", min: 0.01, max: due, step: "0.01" },
      )}${field("Payment date", "paid_date", today(), {
        type: "date",
      })}${field("Reference / method", "reference", "", {
        required: false,
        maxlength: 200,
        placeholder: "Bank transfer reference",
      })}`,
  });
}

export function maintenanceForm(id = "") {
  if (!needsProperty()) return;
  const r = app.data.maintenance.find((m) => m.id === id);
  recordForm({
    title: r ? "Keep things moving." : "What needs a little attention?",
    description: "Record the issue and the next step.",
    record: "maintenance",
    id: r?.id,
    submit: "Save issue",
    fields: html`${propertySelect(r?.property_id)}${field(
        "Issue title",
        "title",
        r?.title,
        { maxlength: 200 },
      )}${area("Description", "description", r?.description)}
      <div class="form-grid">
        ${select(
          "Priority",
          "priority",
          PRIORITIES.map((p) => [p, p] as const),
          r?.priority || "normal",
        )}${select(
          "Status",
          "status",
          [
            ["open", "Open"],
            ["in_progress", "In progress"],
            ["resolved", "Resolved"],
          ],
          r?.status || "open",
        )}
      </div>
      ${field("Assigned contact", "assignee", r?.assignee, {
        required: false,
        maxlength: 150,
      })}`,
  });
}

export function expenseForm(id = "") {
  if (!needsProperty()) return;
  const r = app.data.expenses.find((e) => e.id === id);
  recordForm({
    title: r ? "Edit expense" : "Every cost, accounted for.",
    description: "Record a cost against the right property.",
    record: "expenses",
    id: r?.id,
    submit: "Save record",
    fields: html`${propertySelect(r?.property_id)}${field(
        "Description",
        "title",
        r?.title,
        { maxlength: 200 },
      )}${select(
        "Category",
        "category",
        EXPENSE_CATEGORIES.map((c) => [c, c] as const),
        r?.category || "Maintenance",
      )}
      <div class="form-grid">
        ${field(
          `Amount (${currency()})`,
          "amount",
          r?.amount_cents ? r.amount_cents / 100 : "",
          { type: "number", min: 0.01, step: "0.01" },
        )}${field("Expense date", "expense_date", r?.expense_date || today(), {
          type: "date",
        })}
      </div>`,
  });
}

export function fileForm(propertyId = "") {
  if (!needsProperty()) return;
  recordForm({
    title: "Give your files a home.",
    description:
      "JPEG, PNG, WebP or PDF. Up to 10 MB each, 30 files per property.",
    record: "files",
    submit: "Upload file",
    fields: html`${propertySelect(propertyId)}${field(
      "Choose a file",
      "file",
      "",
      {
        type: "file",
        accept: "image/jpeg,image/png,image/webp,application/pdf",
      },
    )}`,
  });
}

export function propertyDetail(id: string) {
  const p = property(id);
  if (!p) return;
  const l = activeLease(id),
    t = l && tenant(l.tenant_id);
  const files = app.data.files.filter((f) => f.property_id === id);
  openModal(
    html`${intro(p.name, `${p.address}, ${p.city}`)}
      ${badge(l ? "Occupied" : "Vacant", l ? "green" : "vacant")}
      <div class="detail-info">
        <div>
          <small>Monthly rent</small
          ><strong>${cash(l?.rent_cents || p.rent_cents)}</strong>
        </div>
        <div>
          <small>Property</small><strong>${p.type} · ${p.area} m²</strong>
        </div>
        <div>
          <small>Tenant</small
          ><strong>${t ? t.name : "No current tenant"}</strong>
        </div>
        <div>
          <small>Lease end</small
          ><strong>${l ? dateLabel(l.end_date) : "—"}</strong>
        </div>
      </div>
      ${p.notes ? html`<p style="font-size:13px">${p.notes}</p>` : nothing}
      <div class="detail-gallery">
        ${files
          .filter((f) => f.kind === "image")
          .map(
            (f) =>
              html`<a href="/api/files/${f.id}" target="_blank" rel="noopener"
                ><img src="/api/files/${f.id}" alt=${f.name}
              /></a>`,
          )}${
          demo && p.demo_image
            ? html`<img src=${p.demo_image} alt=${p.name} />`
            : nothing
        }
      </div>
      ${files
        .filter((f) => f.kind === "document")
        .map(
          (f) =>
            html`<p>
              <a class="text-link" href="/api/files/${f.id}">▤ ${f.name} ↓</a>
            </p>`,
        )}
      <div class="detail-actions">
        ${btn("Edit property", "edit-properties", id, "button small")}${btn(
          "Upload file",
          "upload-file",
          id,
          "button small outline",
        )}${btn(
          "Delete property",
          "delete-properties",
          id,
          "button small outline danger",
        )}
      </div>`,
  );
}

interface StatementCharge {
  month: string;
  due_date: string;
  amount_cents: number;
  paid_cents: number;
  property: string;
}
interface StatementPayment {
  paid_date: string;
  amount_cents: number;
  reference: string;
}
/** The same shape the statement endpoint returns, built from the demo's local data. */
function localStatement(tenantId: string) {
  const leases = app.data.leases.filter((l) => l.tenant_id === tenantId);
  const charges = app.data.charges.filter((c) =>
    leases.some((l) => l.id === c.lease_id),
  );
  return {
    charges: charges.map((c) => ({
      ...c,
      property: property(lease(c.lease_id)?.property_id ?? "")?.name ?? "",
    })),
    payments: app.data.payments.filter((p) =>
      charges.some((c) => c.id === p.charge_id),
    ),
  };
}

export async function tenantStatement(id: string) {
  const t = tenant(id);
  if (!t) return;
  let source: { charges: StatementCharge[]; payments: StatementPayment[] };
  if (demo) source = localStatement(id);
  else {
    const loading = openModal(
      html`${intro(`Statement for ${t.name}`, "Gathering the full rent history…", "statement")}
        <div class="loading"><span class="spinner"></span>Loading…</div>`,
    );
    try {
      source = (await api(
        `tenants/${encodeURIComponent(id)}/statement`,
      )) as typeof source;
    } catch (err) {
      el.dialog.close();
      throw err;
    }
    // Closed or replaced while loading: leave whatever the user moved on to.
    if (!el.dialog.open || modalKey !== loading) return;
  }
  const charges = source.charges;
  // Charges sort before payments on the same day, so the running balance never dips below what was due.
  const entries = [
    ...charges.map((c) => ({
      date: c.due_date,
      order: 0,
      text: `Rent · ${c.property} · ${monthLabel(c.month, { month: "short", year: "numeric" })}`,
      amount: c.amount_cents,
    })),
    ...source.payments.map((p) => ({
      date: p.paid_date,
      order: 1,
      text: `Payment${p.reference ? " · " + p.reference : ""}`,
      amount: -p.amount_cents,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
  let running = 0;
  const rows = entries.map((e) => {
    running += e.amount;
    return html`<tr>
      <td>${dateLabel(e.date)}</td>
      <td>${e.text}</td>
      <td>${e.amount > 0 ? cash(e.amount) : ""}</td>
      <td>${e.amount < 0 ? cash(-e.amount) : ""}</td>
      <td><strong>${cash(running)}</strong></td>
    </tr>`;
  });
  openModal(
    html`${intro(
        `Statement for ${t.name}`,
        `${[t.email, t.phone].filter(Boolean).join(" · ") || "No contact details"} · Prepared ${dateLabel(today())}`,
        "statement",
      )}
      ${
        rows.length
          ? table(["Date", "Description", "Charged", "Paid", "Balance"], rows)
          : html`<p>No rent charges yet for this tenant.</p>`
      }
      <div class="detail-info">
        <div>
          <small>Total charged</small
          ><strong>${cash(sum(charges, (c) => c.amount_cents))}</strong>
        </div>
        <div>
          <small>Total paid</small
          ><strong>${cash(sum(charges, (c) => c.paid_cents))}</strong>
        </div>
        <div><small>Balance due</small><strong>${cash(running)}</strong></div>
      </div>
      <div class="form-actions">
        ${btn("Close", "close", "", "button outline")}${btn(
          "Print",
          "print-statement",
          "",
          "button",
        )}
      </div>`,
  );
}

export function deleteAccountForm() {
  openModal(
    html`${intro(
        "Delete your account?",
        "This permanently deletes your properties, tenants, leases, rent history, documents and photos, and cancels any paid plan. It cannot be undone.",
      )}
      <form class="record-form" id="delete-account-form">
        <p class="note-box">
          Need a copy? Close this and use “Download my data” first.
        </p>
        ${field("Your password", "password", "", {
          type: "password",
          autocomplete: "current-password",
          maxlength: 128,
        })}${field("Type DELETE to confirm", "confirm", "", {
          placeholder: "DELETE",
          autocomplete: "off",
          maxlength: 6,
        })}
        <div class="form-message" role="alert"></div>
        <div class="form-actions">
          ${btn("Cancel", "close", "", "button outline")}<button
            class="button danger-button"
            type="submit"
          >
            Delete everything
          </button>
        </div>
      </form>`,
  );
}

export function confirmAction(
  title: string,
  description: string,
  action: string,
  id = "",
) {
  openModal(
    html`${intro(title, description)}
      <div class="form-actions">
        ${btn("Cancel", "close", "", "button outline")}${btn(
          "Confirm",
          action,
          id,
          "button danger-button",
        )}
      </div>`,
  );
}
