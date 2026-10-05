import { demoWorkspace } from "../lib/demo";
import { localDate, monthLabel } from "../lib/dates";
type Row = Record<string, any>;
const root = document.querySelector<HTMLElement>(".workspace")!;
const demo = root.dataset.demo === "true";
const main = document.querySelector<HTMLElement>("#main")!;
const dialog = document.querySelector<HTMLDialogElement>("#editor")!;
const editor = document.querySelector<HTMLElement>("#editor-content")!;
let data: Row;
let view = new URLSearchParams(location.search).get("view") || "overview";
let selectedMonth = localDate().slice(0, 7);
let query = "";
let filter = "all";
let toastTimer: ReturnType<typeof setTimeout>;
const titles: Row = {
  overview: "Overview",
  properties: "Properties",
  tenants: "Tenants",
  leases: "Leases",
  rent: "Rent ledger",
  maintenance: "Maintenance",
  expenses: "Expenses",
  documents: "Documents",
  reports: "Reports",
  assistant: "AI assistant",
  settings: "Settings",
};
const esc = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const cash = (n: number) =>
  new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: data?.user?.currency || "EUR",
    maximumFractionDigits: 2,
  }).format((n || 0) / 100);
const dateLabel = (d: string) =>
  d
    ? new Date(d.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : "—";
const today = () => localDate();
const property = (id: string) =>
  data.properties.find((p: Row) => p.id === id) || {};
const tenant = (id: string) => data.tenants.find((t: Row) => t.id === id) || {};
const lease = (id: string) => data.leases.find((l: Row) => l.id === id) || {};
const activeLease = (id: string) =>
  data.leases.find(
    (l: Row) =>
      l.property_id === id &&
      l.status === "active" &&
      l.start_date <= today() &&
      l.end_date >= today(),
  );
const sum = (rows: Row[], field: string) =>
  rows.reduce((s, r) => s + Number(r[field] || 0), 0);
const badge = (text: string, status = text) =>
  `<span class="badge ${esc(status)}">${esc(text.replaceAll("_", " "))}</span>`;
const btn = (
  label: string,
  action: string,
  id = "",
  cls = "button small",
  ariaLabel = "",
) =>
  `<button class="${cls}" data-action="${action}" data-id="${esc(id)}"${ariaLabel ? ` aria-label="${esc(ariaLabel)}"` : ""}>${label}</button>`;
const arrow = '<span class="glyph" aria-hidden="true">↗</span>';
const empty = (
  title: string,
  description: string,
  label?: string,
  action?: string,
) =>
  `<div class="empty"><span class="round-icon">⌂</span><h2>${esc(title)}</h2><p>${esc(description)}</p>${label ? btn(esc(label), action!) : ""}</div>`;
const heading = (title: string, subtitle: string, action = "") =>
  `<div class="page-heading"><div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div><div class="heading-actions">${action}</div></div>`;
const stat = (label: string, value: string, note: string, icon = "↗") =>
  `<article class="stat"><div class="stat-top"><span>${esc(label)}</span><span class="stat-icon" aria-hidden="true">${icon}</span></div><strong>${value}</strong><small>${esc(note)}</small></article>`;
const table = (headers: string[], rows: string[]) =>
  `<div class="panel table-wrap"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
const monthPicker = () =>
  `<input type="month" id="month-filter" aria-label="Reporting month" value="${selectedMonth}" min="2000-01" max="2099-12"/>`;
function toast(message: string) {
  const el = document.querySelector<HTMLElement>("#toast")!;
  el.textContent = message;
  el.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.style.display = "none"), 5000);
}
async function api(path: string, method = "GET", body?: unknown) {
  const res = await fetch("/api/" + path, {
    method,
    headers:
      body instanceof FormData
        ? {}
        : body
          ? { "Content-Type": "application/json" }
          : {},
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const result = (await res.json().catch(() => null)) as Row | null;
  if (!res.ok || !result) {
    if (res.status === 401) {
      location.href = "/login";
    }
    throw new Error(result?.error || "The request could not be completed.");
  }
  return result;
}
async function load() {
  try {
    data = demo ? demoWorkspace() : await api("workspace");
    document.querySelector("#workspace-name")!.textContent =
      data.user.company || "My workspace";
    document.querySelector("#plan-info")!.textContent =
      `${data.limits.label} plan · ${data.properties.length}/${data.limits.properties} properties`;
    document.querySelector(".avatar")!.textContent = data.user.name
      .slice(0, 1)
      .toUpperCase();
    document.querySelector("#today-label")!.textContent =
      new Date().toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    render();
  } catch (err) {
    main.innerHTML = empty(
      "We couldn’t open your workspace",
      (err as Error).message,
      "Try again",
      "reload",
    );
  }
}
function navigate(next: string) {
  view = titles[next] ? next : "overview";
  query = "";
  filter = "all";
  history.pushState(null, "", `${location.pathname}?view=${view}`);
  root.classList.remove("nav-open");
  document
    .querySelector(".menu-toggle")
    ?.setAttribute("aria-expanded", "false");
  render();
}
function render() {
  if (!titles[view]) view = "overview";
  document.querySelector("#breadcrumb")!.textContent = titles[view];
  document
    .querySelectorAll("[data-view]")
    .forEach((a) =>
      a.classList.toggle("active", (a as HTMLElement).dataset.view === view),
    );
  main.innerHTML = (
    {
      overview: overview,
      properties: properties,
      tenants: tenants,
      leases: leases,
      rent: rent,
      maintenance: maintenance,
      expenses: expenses,
      documents: documents,
      reports: reports,
      assistant: assistant,
      settings: settings,
    } as Record<string, () => string>
  )[view]();
}
function financial(m: string) {
  const c = data.charges.filter((c: Row) => c.month === m),
    p = data.payments.filter((p: Row) => p.paid_date.startsWith(m)),
    e = data.expenses.filter((e: Row) => e.expense_date.startsWith(m));
  return {
    charges: c,
    received: sum(p, "amount_cents"),
    charged: sum(c, "amount_cents"),
    allocated: sum(c, "paid_cents"),
    expenses: sum(e, "amount_cents"),
  };
}
function propertyCard(p: Row) {
  const l = activeLease(p.id),
    t = l ? tenant(l.tenant_id) : null;
  const photo = data.files.find(
    (f: Row) => f.property_id === p.id && f.kind === "image",
  );
  const image = photo ? "/api/files/" + photo.id : p.demo_image;
  return `<article class="property-card"><div class="property-image">${image ? `<img src="${esc(image)}" alt="${esc(p.name)}" loading="lazy"/>` : '<span class="placeholder">⌂</span>'}${badge(l ? "Occupied" : "Vacant", l ? "green" : "vacant")}</div><div class="property-card-content"><h3>${esc(p.name)}</h3><p>${esc(p.address)}, ${esc(p.city)}</p><div class="property-meta"><span>${p.bedrooms} bed${p.bedrooms === 1 ? "" : "s"}</span><span>${p.area} m²</span><span>${esc(p.type)}</span></div><div class="property-card-bottom"><strong>${cash(l?.rent_cents || p.rent_cents)}<small> / month</small></strong>${btn("↗", "property-detail", p.id, "icon-button", `Open ${p.name}`)}</div><small style="display:block;margin-top:10px">${t ? esc(t.name) : "Ready for your next tenant"}</small></div></article>`;
}
function overview() {
  const f = financial(selectedMonth);
  const occupied = data.properties.filter((p: Row) => activeLease(p.id)).length;
  const outstanding = data.charges.reduce(
    (s: number, c: Row) => s + c.amount_cents - c.paid_cents,
    0,
  );
  const ratio = f.charged ? Math.round((f.allocated / f.charged) * 100) : 0;
  const now = new Date(selectedMonth + "-01T00:00:00Z");
  const months = Array.from({ length: 6 }, (_, i) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + i, 1))
      .toISOString()
      .slice(0, 7),
  );
  const fs = months.map(financial),
    max = Math.max(1, ...fs.flatMap((f) => [f.received, f.expenses]));
  return (
    heading(
      `A little clarity, ${data.user.name.split(" ")[0]}.`,
      "Here’s what’s happening across your rental portfolio.",
      btn("+ Add property", "new-properties"),
    ) +
    `<div class="stat-grid">${stat("Total properties", String(data.properties.length), `${occupied} occupied · ${data.properties.length - occupied} vacant`, "⌂")}${stat("Rent collected", cash(f.received), monthLabel(selectedMonth, { month: "long", year: "numeric" }), "↗")}${stat("Outstanding rent", cash(outstanding), "Across all generated rent charges", "◷")}${stat("Open maintenance", String(data.maintenance.filter((m: Row) => m.status !== "resolved").length), "A little attention goes a long way", "⚒")}</div><div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h2>Your cash flow</h2><p>A clear view of the last six months</p></div>${badge("6 months")}</div><div class="chart"><div class="chart-legend"><span>Rent collected</span><span>Expenses</span></div><table class="sr-only"><caption>Rent collected and expenses, last six months</caption><thead><tr><th>Month</th><th>Rent collected</th><th>Expenses</th></tr></thead><tbody>${fs.map((f, i) => `<tr><td>${monthLabel(months[i], { month: "long", year: "numeric" })}</td><td>${cash(f.received)}</td><td>${cash(f.expenses)}</td></tr>`).join("")}</tbody></table><div class="bar-chart" aria-hidden="true">${fs.map((f, i) => `<div class="bar-group"><div class="bar" style="height:${(f.received / max) * 100}%" title="${months[i]} rent: ${cash(f.received)}"></div><div class="bar expense" style="height:${(f.expenses / max) * 100}%" title="${months[i]} expenses: ${cash(f.expenses)}"></div></div>`).join("")}</div><div class="chart-months" aria-hidden="true">${months.map((m) => `<span>${monthLabel(m, { month: "short" })}</span>`).join("")}</div></div></section><section class="panel"><div class="panel-head"><h2>Rent collection</h2>${badge(monthLabel(selectedMonth, { month: "short" }))}</div><div class="collection-card"><div class="donut" style="--percent:${ratio}"><div><strong>${ratio}%</strong><small>of this month’s charges</small></div></div><div class="collection-details"><div><span>Allocated payments</span><strong>${cash(f.allocated)}</strong></div><div><span>Still to collect</span><strong>${cash(f.charged - f.allocated)}</strong></div></div></div></section></div><div class="section-row"><h2>Your properties <span class="pill-count">${data.properties.length}</span></h2><a href="?view=properties" data-view="properties">View all properties ${arrow}</a></div>${data.properties.length ? `<div class="property-grid">${data.properties.slice(0, 3).map(propertyCard).join("")}</div>` : `<div class="panel">${empty("Make yourself at home.", "Add your first rental unit, then connect a tenant and lease to start tracking rent.", "Add your first property", "new-properties")}</div>`}<div class="ai-nudge"><span class="round-icon">✧</span><div><h3>A helpful second pair of eyes.</h3><p>Ask about rent balances, repairs, or your next tenant message.</p></div><button class="button" data-view="assistant">Ask your assistant <span aria-hidden="true">↗</span></button></div>`
  );
}
function properties() {
  const rows = data.properties.filter(
    (p: Row) =>
      (p.name + " " + p.address + " " + p.city)
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (filter === "all" ||
        (filter === "occupied" ? !!activeLease(p.id) : !activeLease(p.id))),
  );
  return (
    heading(
      "Every property. One place.",
      "Your rental portfolio, organised around the details that matter.",
      btn("+ Add property", "new-properties"),
    ) +
    `<div class="toolbar"><input id="search" aria-label="Search properties" placeholder="Search by name, address or city…" value="${esc(query)}"/><select id="status-filter" aria-label="Occupancy"><option value="all" ${filter === "all" ? "selected" : ""}>All properties</option><option value="occupied" ${filter === "occupied" ? "selected" : ""}>Occupied</option><option value="vacant" ${filter === "vacant" ? "selected" : ""}>Vacant</option></select></div>${rows.length ? `<div class="property-grid">${rows.map(propertyCard).join("")}</div>` : empty("A little room to grow.", data.properties.length ? "No properties match this search." : "Add your first property to start bringing everything together.", "Add property", "new-properties")}`
  );
}
function tenants() {
  return (
    heading(
      "People make a property a home.",
      "Keep contact details and notes close at hand.",
      btn("+ Add tenant", "new-tenants"),
    ) +
    (data.tenants.length
      ? table(
          ["Tenant", "Email", "Phone", "Rental", "Actions"],
          data.tenants.map((t: Row) => {
            const l = data.leases.find(
              (l: Row) => l.tenant_id === t.id && l.status === "active",
            );
            return `<tr><td><strong>${esc(t.name)}</strong></td><td>${esc(t.email || "—")}</td><td>${esc(t.phone || "—")}</td><td>${l ? esc(property(l.property_id).name) : "No active lease"}</td><td><div class="action-inline">${btn("Edit", "edit-tenants", t.id, "icon-button")}${btn("Delete", "delete-tenants", t.id, "icon-button danger")}</div></td></tr>`;
          }),
        )
      : empty(
          "Your tenant directory starts here.",
          "Add a tenant, then link them to a property with a lease.",
          "Add tenant",
          "new-tenants",
        ))
  );
}
function leases() {
  return (
    heading(
      "A place for every agreement.",
      "Keep rental dates, deposits and monthly rent connected.",
      btn("+ Create lease", "new-leases"),
    ) +
    (data.leases.length
      ? table(
          [
            "Property / tenant",
            "Term",
            "Monthly rent",
            "Deposit",
            "Status",
            "Actions",
          ],
          data.leases.map(
            (l: Row) =>
              `<tr><td><strong>${esc(property(l.property_id).name)}</strong><small>${esc(tenant(l.tenant_id).name)}</small></td><td>${dateLabel(l.start_date)}<small>to ${dateLabel(l.end_date)}</small></td><td>${cash(l.rent_cents)}<small>Due on day ${l.due_day}</small></td><td>${cash(l.deposit_cents)}</td><td>${badge(l.status === "active" && l.end_date < today() ? "Expired" : l.status)}</td><td>${l.status === "active" ? btn("End lease", "end-lease", l.id, "icon-button") : "History retained"}</td></tr>`,
          ),
        )
      : empty(
          "Put your agreements in order.",
          "Add a property and a tenant first, then create a lease.",
          "Create lease",
          "new-leases",
        ))
  );
}
function chargeStatus(c: Row) {
  return c.paid_cents >= c.amount_cents
    ? "paid"
    : c.paid_cents > 0
      ? "partial"
      : c.due_date < today()
        ? "overdue"
        : "due";
}
function rent() {
  const f = financial(selectedMonth);
  return (
    heading(
      "Rent, with a clear picture.",
      "Generate charges for active leases. Record payments when they arrive.",
      monthPicker() + btn("Generate charges", "generate-charges"),
    ) +
    `<div class="stat-grid">${stat("Charged this month", cash(f.charged), `${f.charges.length} rent charges`)}${stat("Allocated to charges", cash(f.allocated), "Includes payments on any date")}${stat("Outstanding", cash(f.charged - f.allocated), "For this month’s charges", "◷")}${stat("Cash received", cash(f.received), "Payments recorded this month")}</div><p class="month-caption">Monthly charges use the full lease rent; partial months are not prorated. Generation is safe to repeat.</p>` +
    (f.charges.length
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
          f.charges.map((c: Row) => {
            const l = lease(c.lease_id);
            return `<tr><td><strong>${esc(property(l.property_id).name)}</strong><small>${esc(tenant(l.tenant_id).name)}</small></td><td>${dateLabel(c.due_date)}</td><td>${cash(c.amount_cents)}</td><td>${cash(c.paid_cents)}</td><td>${cash(c.amount_cents - c.paid_cents)}</td><td>${badge(chargeStatus(c))}</td><td>${c.paid_cents < c.amount_cents ? btn("Record payment", "record-payment", c.id, "button small outline") : ""}</td></tr>`;
          }),
        )
      : empty(
          "Nothing due here yet.",
          "Create an active lease, choose a month and generate its rent charges.",
          "Generate charges",
          "generate-charges",
        )) +
    `<div class="section-row"><h2>Payment history</h2></div>` +
    (data.payments.filter((p: Row) => p.paid_date.startsWith(selectedMonth))
      .length
      ? table(
          ["Property", "Payment date", "Amount", "Reference", "Actions"],
          data.payments
            .filter((p: Row) => p.paid_date.startsWith(selectedMonth))
            .map((p: Row) => {
              const c =
                data.charges.find((c: Row) => c.id === p.charge_id) || {};
              return `<tr><td>${esc(property(lease(c.lease_id).property_id).name)}</td><td>${dateLabel(p.paid_date)}</td><td>${cash(p.amount_cents)}</td><td>${esc(p.reference || "—")}</td><td>${btn("Reverse", "delete-payments", p.id, "icon-button danger")}</td></tr>`;
            }),
        )
      : '<p style="font-size:12px">No payments recorded in this month.</p>')
  );
}
function maintenance() {
  return (
    heading(
      "Keep every repair moving.",
      "From the first report to the final fix.",
      btn("+ Report issue", "new-maintenance"),
    ) +
    `<div class="kanban">${[
      ["open", "Open"],
      ["in_progress", "In progress"],
      ["resolved", "Resolved"],
    ]
      .map(([s, label]) => {
        const rows = data.maintenance.filter((m: Row) => m.status === s);
        return `<section class="kanban-column"><h2>${label}<span class="pill-count">${rows.length}</span></h2>${rows.length ? rows.map((m: Row) => `<article class="issue-card">${badge(m.priority)}<h3>${esc(m.title)}</h3><p>${esc(property(m.property_id).name)}</p><p>${esc(m.description.slice(0, 120))}</p><div class="issue-bottom"><span>${esc(m.assignee || "Unassigned")}</span>${btn(`Open ${arrow}`, "edit-maintenance", m.id, "icon-button")}</div></article>`).join("") : "<small>No issues here.</small>"}</section>`;
      })
      .join("")}</div>`
  );
}
function expenses() {
  const rows = data.expenses
    .filter((e: Row) => e.expense_date.startsWith(selectedMonth))
    .sort((a: Row, b: Row) => b.expense_date.localeCompare(a.expense_date));
  return (
    heading(
      "Know where your money goes.",
      "Track property costs and keep your cash-flow picture honest.",
      monthPicker() + btn("+ Add expense", "new-expenses"),
    ) +
    `<div class="stat-grid">${stat("Total expenses", cash(sum(rows, "amount_cents")), selectedMonth)}${stat(
      "Maintenance costs",
      cash(
        sum(
          rows.filter((r: Row) => r.category === "Maintenance"),
          "amount_cents",
        ),
      ),
      "Recorded repair expenses",
      "⚒",
    )}</div>` +
    (rows.length
      ? table(
          ["Expense", "Property", "Category", "Date", "Amount", "Actions"],
          rows.map(
            (r: Row) =>
              `<tr><td><strong>${esc(r.title)}</strong></td><td>${esc(property(r.property_id).name)}</td><td>${badge(r.category)}</td><td>${dateLabel(r.expense_date)}</td><td>${cash(r.amount_cents)}</td><td><div class="action-inline">${btn("Edit", "edit-expenses", r.id, "icon-button")}${btn("Delete", "delete-expenses", r.id, "icon-button danger")}</div></td></tr>`,
          ),
        )
      : empty(
          "A clean slate.",
          "Add a repair, utility bill or other property expense for this month.",
          "Add expense",
          "new-expenses",
        ))
  );
}
function documents() {
  return (
    heading(
      "Every detail, safely in its place.",
      "Private property photos and PDF documents. Up to 10 MB per file.",
      btn("+ Upload file", "upload-file"),
    ) +
    (data.files.length
      ? `<div class="file-grid">${data.files.map((f: Row) => `<article class="file-card">${f.kind === "image" ? `<img src="/api/files/${esc(f.id)}" alt="${esc(f.name)}" loading="lazy"/>` : '<div class="pdf-icon">▤ PDF</div>'}<strong>${esc(f.name)}</strong><p>${esc(property(f.property_id).name)} · ${(f.size / 1024 / 1024).toFixed(2)} MB</p><div><a href="/api/files/${esc(f.id)}" target="_blank" rel="noopener">${f.kind === "image" ? "Open image" : "Download PDF"} ${arrow}</a>${btn("Delete", "delete-files", f.id, "icon-button danger")}</div></article>`).join("")}</div>`
      : empty(
          "Your files deserve a home.",
          "Upload a property photo or a PDF lease. They will stay private to your workspace.",
          "Upload file",
          "upload-file",
        ))
  );
}
function reportRows() {
  return data.properties.map((p: Row) => {
    const ls = data.leases
        .filter((l: Row) => l.property_id === p.id)
        .map((l: Row) => l.id),
      cs = data.charges
        .filter((c: Row) => ls.includes(c.lease_id))
        .map((c: Row) => c.id);
    const inc = sum(
        data.payments.filter(
          (r: Row) =>
            cs.includes(r.charge_id) && r.paid_date.startsWith(selectedMonth),
        ),
        "amount_cents",
      ),
      exp = sum(
        data.expenses.filter(
          (r: Row) =>
            r.property_id === p.id && r.expense_date.startsWith(selectedMonth),
        ),
        "amount_cents",
      );
    return { p, inc, exp, net: inc - exp };
  });
}
function reports() {
  const f = financial(selectedMonth);
  return (
    heading(
      "The bigger picture, made simple.",
      "Monthly cash-flow statements based on recorded payments and expenses.",
      monthPicker() + btn("↓ Export CSV", "export-report"),
    ) +
    `<div class="stat-grid">${stat("Rent collected", cash(f.received), "Based on payment date")}${stat("Total expenses", cash(f.expenses), "Based on expense date")}${stat("Net cash flow", cash(f.received - f.expenses), "Collected rent minus expenses")}</div>` +
    (data.properties.length
      ? table(
          ["Property", "Rent collected", "Expenses", "Net cash flow"],
          reportRows().map(
            ({ p, inc, exp, net }: Row) =>
              `<tr><td><strong>${esc(p.name)}</strong><small>${esc(p.address)}</small></td><td>${cash(inc)}</td><td>${cash(exp)}</td><td><strong>${cash(net)}</strong></td></tr>`,
          ),
        )
      : empty(
          "Your story is just getting started.",
          "Add properties and record transactions to see your monthly report.",
        )) +
    '<div class="note-box">This is a cash-flow report, not a tax return or complete accounting statement. Deposits, unrecorded payments, depreciation and mortgage principal are not included.</div>'
  );
}
function assistant() {
  return (
    heading(
      "A helpful second pair of eyes.",
      `${data.aiUsage} of ${data.limits.ai} requests used today. Your allowance resets at midnight UTC.`,
    ) +
    `<div class="assistant-layout"><div class="assistant-intro"><span class="round-icon">✧</span><h2>What can I help you untangle?</h2><p>Ask about your properties, outstanding rent or open maintenance.<br/>Or let’s find the right words for your next message.</p></div><div class="prompt-options">${["Summarise my outstanding rent.", "Which maintenance issues should I prioritise?", "Draft a friendly reminder for an overdue rent payment.", "Give me a quick overview of my portfolio."].map((p) => `<button data-prompt="${esc(p)}">${esc(p)} ${arrow}</button>`).join("")}</div><div class="chat-messages" aria-live="polite"></div><form class="chat-form" id="ai-form"><textarea name="prompt" aria-label="Ask your property assistant" maxlength="2000" required placeholder="Ask about your workspace…"></textarea><button class="button" type="submit">Send ${arrow}</button></form><p class="assistant-note">AI can make mistakes. Review every draft. It cannot change records or send messages.</p></div>`
  );
}
function settings() {
  return (
    heading(
      "Your workspace, your way.",
      "A few details to make this place your own.",
    ) +
    `<div class="settings-grid"><section class="panel"><form class="settings-form" id="settings-form"><h2>Workspace details</h2>${field("Your name", "name", data.user.name)}${field("Workspace / company name", "company", data.user.company, "text", false)}${select(
      "Report currency",
      "currency",
      [
        ["EUR", "EUR — Euro"],
        ["USD", "USD — US Dollar"],
        ["GBP", "GBP — British Pound"],
      ],
      data.user.currency,
    )}<small>Currency can only change before you add your first property. Existing values are never converted.</small><div class="form-message" role="alert"></div><button class="button" type="submit">Save changes</button></form></section><section class="panel panel-padding"><h2 style="font-size:20px">Your plan</h2><p style="font-size:12px">${data.limits.label} · ${data.properties.length} of ${data.limits.properties} properties · ${data.limits.ai} AI requests/day</p>${!data.billingEnabled ? '<div class="note-box">Paid upgrades are coming soon. Your free workspace is ready to use.</div>' : ""}<div class="plan-options">${[
      ["landlord", "Landlord", "15 properties · 30 AI requests/day"],
      ["portfolio", "Portfolio", "50 properties · 100 AI requests/day"],
    ]
      .map(
        ([p, n, d]) =>
          `<div class="plan-option"><div><strong>${n}</strong><small>${d}</small></div><button class="button outline" data-action="checkout" data-id="${p}" ${!data.billingEnabled || p === data.user.plan ? "disabled" : ""}>${p === data.user.plan ? "Current plan" : `View checkout ${arrow}`}</button></div>`,
      )
      .join(
        "",
      )}</div>${data.user.stripe_subscription_id ? btn("Manage subscription", "billing-portal", "", "button small outline") : ""}<p style="font-size:11px;margin-top:22px">Account: ${esc(data.user.email)}</p><a class="text-link" style="font-size:12px" href="/forgot-password">Reset your password →</a></section></div>`
  );
}
function field(
  label: string,
  name: string,
  value: unknown = "",
  type = "text",
  required = true,
  extra = "",
) {
  return `<label>${esc(label)}<input type="${type}" name="${name}" value="${esc(value)}" ${required ? "required" : ""} ${extra}/></label>`;
}
function area(label: string, name: string, value: unknown = "") {
  return `<label>${esc(label)}<textarea name="${name}" maxlength="5000">${esc(value)}</textarea></label>`;
}
function select(
  label: string,
  name: string,
  options: string[][],
  value: unknown = "",
) {
  return `<label>${esc(label)}<select name="${name}" required>${options.map(([v, l]) => `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
}
function propertySelect(value = "") {
  return select(
    "Property",
    "property_id",
    data.properties.map((p: Row) => [p.id, p.name]),
    value,
  );
}
function openModal(html: string) {
  editor.innerHTML = html;
  editor.querySelector("h2")?.setAttribute("id", "editor-title");
  if (!dialog.open) dialog.showModal();
}
function editForm(type: string, id = "") {
  const row = id ? (data[type] || []).find((r: Row) => r.id === id) || {} : {};
  if (
    ["leases", "maintenance", "expenses", "files"].includes(type) &&
    !data.properties.length
  ) {
    toast("Add a property first.");
    return;
  }
  if (type === "leases" && !data.tenants.length) {
    toast("Add a tenant first.");
    return;
  }
  let title = "",
    desc = "",
    fields = "";
  const r = row;
  if (type === "properties") {
    title = id ? "Edit property" : "A new place to call yours.";
    desc = "Add one rentable unit per property.";
    fields =
      field(
        "Property name",
        "name",
        r.name,
        "text",
        true,
        'maxlength="150" placeholder="The Parkside Apartment"',
      ) +
      field(
        "Street address",
        "address",
        r.address,
        "text",
        true,
        'maxlength="250"',
      ) +
      `<div class="form-grid">${field("City", "city", r.city, "text", true, 'maxlength="100"')}${select(
        "Property type",
        "type",
        ["Apartment", "House", "Studio", "Commercial", "Other"].map((x) => [
          x,
          x,
        ]),
        r.type || "Apartment",
      )}</div><div class="form-grid">${field("Bedrooms", "bedrooms", r.bedrooms ?? 1, "number", true, 'min="0" max="30"')}${field("Floor area (m²)", "area", r.area ?? 0, "number", true, 'min="0" max="100000" step="0.1"')}</div>` +
      field(
        `Advertised monthly rent (${data.user.currency})`,
        "rent",
        r.rent_cents ? r.rent_cents / 100 : 0,
        "number",
        true,
        'min="0" step="0.01"',
      ) +
      area("Notes", "notes", r.notes);
  }
  if (type === "tenants") {
    title = id ? "Edit tenant" : "Make an introduction.";
    desc = "Keep contact information in one easy-to-find place.";
    fields =
      field("Full name", "name", r.name, "text", true, 'maxlength="150"') +
      field("Email", "email", r.email, "email", false, 'maxlength="254"') +
      field("Phone", "phone", r.phone, "tel", false, 'maxlength="60"') +
      area("Notes", "notes", r.notes);
  }
  if (type === "leases") {
    title = "Connect the details.";
    desc = "Create an agreement between a property and a tenant.";
    const available = data.properties.filter(
      (p: Row) =>
        !data.leases.some(
          (l: Row) => l.property_id === p.id && l.status === "active",
        ),
    );
    if (!available.length) {
      toast("All properties have an active lease. End one or add a property.");
      return;
    }
    fields =
      select(
        "Property",
        "property_id",
        available.map((p: Row) => [p.id, p.name]),
      ) +
      select(
        "Tenant",
        "tenant_id",
        data.tenants.map((t: Row) => [t.id, t.name]),
      ) +
      `<div class="form-grid">${field("Start date", "start_date", today(), "date")}${field("End date", "end_date", "", "date")}</div><div class="form-grid">${field(`Monthly rent (${data.user.currency})`, "rent", available[0].rent_cents / 100 || "", "number", true, 'min="0.01" step="0.01"')}${field(`Deposit (${data.user.currency})`, "deposit", 0, "number", true, 'min="0" step="0.01"')}</div>` +
      field(
        "Rent due on day of month",
        "due_day",
        1,
        "number",
        true,
        'min="1" max="28"',
      ) +
      "<small>Charges use full monthly rent, including first and last months. Generate them from the Rent ledger.</small>";
  }
  if (type === "maintenance") {
    title = id ? "Keep things moving." : "What needs a little attention?";
    desc = "Record the issue and the next step.";
    fields =
      propertySelect(r.property_id) +
      field("Issue title", "title", r.title, "text", true, 'maxlength="200"') +
      area("Description", "description", r.description) +
      `<div class="form-grid">${select(
        "Priority",
        "priority",
        ["low", "normal", "urgent"].map((x) => [x, x]),
        r.priority || "normal",
      )}${select(
        "Status",
        "status",
        [
          ["open", "Open"],
          ["in_progress", "In progress"],
          ["resolved", "Resolved"],
        ],
        r.status || "open",
      )}</div>` +
      field(
        "Assigned contact",
        "assignee",
        r.assignee,
        "text",
        false,
        'maxlength="150"',
      );
  }
  if (type === "expenses") {
    title = id ? "Edit expense" : "Every cost, accounted for.";
    desc = "Record a cost against the right property.";
    fields =
      propertySelect(r.property_id) +
      field("Description", "title", r.title, "text", true, 'maxlength="200"') +
      select(
        "Category",
        "category",
        ["Maintenance", "Utilities", "Insurance", "Management", "Other"].map(
          (x) => [x, x],
        ),
        r.category || "Maintenance",
      ) +
      `<div class="form-grid">${field(`Amount (${data.user.currency})`, "amount", r.amount_cents ? r.amount_cents / 100 : "", "number", true, 'min="0.01" step="0.01"')}${field("Expense date", "expense_date", r.expense_date || today(), "date")}</div>`;
  }
  if (type === "files") {
    title = "Give your files a home.";
    desc = "JPEG, PNG, WebP or PDF. Up to 10 MB each, 30 files per property.";
    fields =
      propertySelect(id) +
      field(
        "Choose a file",
        "file",
        "",
        "file",
        true,
        'accept="image/jpeg,image/png,image/webp,application/pdf"',
      );
    id = "";
  }
  if (type === "payments") {
    const c = data.charges.find((c: Row) => c.id === id);
    if (!c) return;
    title = "A payment received.";
    desc = `${property(lease(c.lease_id).property_id).name} · ${cash(c.amount_cents - c.paid_cents)} outstanding`;
    fields =
      `<input type="hidden" name="charge_id" value="${esc(id)}"/>` +
      field(
        `Amount received (${data.user.currency})`,
        "amount",
        (c.amount_cents - c.paid_cents) / 100,
        "number",
        true,
        `min="0.01" max="${(c.amount_cents - c.paid_cents) / 100}" step="0.01"`,
      ) +
      field("Payment date", "paid_date", today(), "date") +
      field(
        "Reference / method",
        "reference",
        "",
        "text",
        false,
        'maxlength="200" placeholder="Bank transfer reference"',
      );
    id = "";
  }
  openModal(
    `<div class="editor-heading"><h2>${title}</h2><p>${esc(desc)}</p></div><form class="record-form" data-record="${type}" data-id="${esc(id)}">${fields}<div class="form-message" role="alert"></div><div class="form-actions">${btn("Cancel", "close", "", "button outline")}<button class="button" type="submit">${type === "files" ? "Upload file" : "Save " + (type === "properties" ? "property" : type === "maintenance" ? "issue" : type === "payments" ? "payment" : "record")} ${arrow}</button></div></form>`,
  );
}
function propertyDetail(id: string) {
  const p = property(id);
  if (!p.id) return;
  const l = activeLease(id),
    t = l ? tenant(l.tenant_id) : null;
  const files = data.files.filter((f: Row) => f.property_id === id);
  openModal(
    `<div class="editor-heading"><h2>${esc(p.name)}</h2><p>${esc(p.address)}, ${esc(p.city)}</p></div>${badge(l ? "Occupied" : "Vacant", l ? "green" : "vacant")}<div class="detail-info"><div><small>Monthly rent</small><strong>${cash(l?.rent_cents || p.rent_cents)}</strong></div><div><small>Property</small><strong>${esc(p.type)} · ${p.area} m²</strong></div><div><small>Tenant</small><strong>${t ? esc(t.name) : "No current tenant"}</strong></div><div><small>Lease end</small><strong>${l ? dateLabel(l.end_date) : "—"}</strong></div></div>${p.notes ? `<p style="font-size:13px">${esc(p.notes)}</p>` : ""}<div class="detail-gallery">${files
      .filter((f: Row) => f.kind === "image")
      .map(
        (f: Row) =>
          `<a href="/api/files/${esc(f.id)}" target="_blank" rel="noopener"><img src="/api/files/${esc(f.id)}" alt="${esc(f.name)}"/></a>`,
      )
      .join(
        "",
      )}${demo ? `<img src="${esc(p.demo_image)}" alt="${esc(p.name)}"/>` : ""}</div>${files
      .filter((f: Row) => f.kind === "document")
      .map(
        (f: Row) =>
          `<p><a class="text-link" href="/api/files/${esc(f.id)}">▤ ${esc(f.name)} ↓</a></p>`,
      )
      .join(
        "",
      )}<div class="detail-actions">${btn("Edit property", "edit-properties", id, "button small")}${btn("Upload file", "upload-file", id, "button small outline")}${btn("Delete property", "delete-properties", id, "button small outline danger")}</div>`,
  );
}
function confirmAction(
  title: string,
  description: string,
  action: string,
  id = "",
) {
  openModal(
    `<div class="editor-heading"><h2>${esc(title)}</h2><p>${esc(description)}</p></div><div class="form-actions">${btn("Cancel", "close", "", "button outline")}${btn("Confirm", action, id, "button danger-button")}</div>`,
  );
}
function ensureWritable() {
  if (demo) {
    toast(
      "This is a read-only demo. Create a free workspace to save your own records.",
    );
    return false;
  }
  return true;
}
async function action(action: string, id = "", el?: HTMLButtonElement) {
  if (action === "close") {
    dialog.close();
    return;
  }
  if (action === "reload") {
    await load();
    return;
  }
  if (action === "property-detail") {
    propertyDetail(id);
    return;
  }
  if (action.startsWith("new-")) {
    editForm(action.slice(4));
    return;
  }
  if (action.startsWith("edit-")) {
    editForm(action.slice(5), id);
    return;
  }
  if (action === "upload-file") {
    editForm("files", id);
    return;
  }
  if (action === "record-payment") {
    editForm("payments", id);
    return;
  }
  if (action === "logout") {
    if (!demo) await api("auth/logout", "POST", {});
    location.href = "/";
    return;
  }
  if (action === "export-report") {
    if (demo) {
      toast("Create a workspace to export your own reports.");
      return;
    }
    location.href = "/api/reports?month=" + selectedMonth;
    return;
  }
  if (!ensureWritable()) return;
  if (action.startsWith("delete-")) {
    const type = action.slice(7);
    confirmAction(
      type === "payments" ? "Reverse this payment?" : "Delete this record?",
      type === "payments"
        ? "The payment will be removed and its rent balance restored."
        : "This cannot be undone. Linked financial history may prevent deletion.",
      "confirmed-delete-" + type,
      id,
    );
    return;
  }
  if (action === "end-lease") {
    confirmAction(
      "End this lease?",
      "Existing rent charges and payments are kept. No new monthly charges will be generated for this lease.",
      "confirmed-end-lease",
      id,
    );
    return;
  }
  if (el) el.disabled = true;
  try {
    if (action.startsWith("confirmed-delete-")) {
      await api(action.slice(17) + "/" + id, "DELETE");
      dialog.close();
      toast("Record removed.");
      await load();
    }
    if (action === "confirmed-end-lease") {
      await api("leases/" + id, "PATCH", { status: "ended" });
      dialog.close();
      toast("Lease ended.");
      await load();
    }
    if (action === "generate-charges") {
      await api("charges/generate", "POST", { month: selectedMonth });
      toast("Rent charges are up to date.");
      await load();
    }
    if (action === "checkout") {
      const r = await api("billing/checkout", "POST", { plan: id });
      location.href = r.url;
    }
    if (action === "billing-portal") {
      const r = await api("billing/portal", "POST", {});
      location.href = r.url;
    }
  } finally {
    if (el) el.disabled = false;
  }
}
document.addEventListener("click", async (event) => {
  const target = event.target as HTMLElement;
  const nav = target.closest<HTMLElement>("[data-view]");
  if (nav) {
    event.preventDefault();
    navigate(nav.dataset.view!);
    return;
  }
  const button = target.closest<HTMLButtonElement>("[data-action]");
  if (button) {
    event.preventDefault();
    try {
      await action(button.dataset.action!, button.dataset.id || "", button);
    } catch (err) {
      toast((err as Error).message);
    }
  }
  const prompt = target.closest<HTMLElement>("[data-prompt]");
  if (prompt) {
    const input = main.querySelector<HTMLTextAreaElement>("[name=prompt]");
    if (input) {
      input.value = prompt.dataset.prompt!;
      input.focus();
    }
  }
});
document.querySelector(".menu-toggle")?.addEventListener("click", () => {
  const open = root.classList.toggle("nav-open");
  document
    .querySelector(".menu-toggle")
    ?.setAttribute("aria-expanded", String(open));
});
document.addEventListener("click", (e) => {
  if (
    root.classList.contains("nav-open") &&
    !(e.target as HTMLElement).closest(".sidebar,.menu-toggle")
  ) {
    root.classList.remove("nav-open");
    document
      .querySelector(".menu-toggle")
      ?.setAttribute("aria-expanded", "false");
  }
});
main.addEventListener("change", (event) => {
  const el = event.target as HTMLInputElement;
  if (el.id === "month-filter") {
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(el.value)) return;
    selectedMonth = el.value;
    render();
  }
  if (el.id === "status-filter") {
    filter = el.value;
    render();
  }
});
editor.addEventListener("change", (event) => {
  const el = event.target as HTMLSelectElement;
  const rent = el
    .closest("form[data-record=leases]")
    ?.querySelector<HTMLInputElement>("[name=rent]");
  if (rent && el.name === "property_id")
    rent.value = String(property(el.value).rent_cents / 100 || "");
});
main.addEventListener("input", (event) => {
  const el = event.target as HTMLInputElement;
  if (el.id === "search") {
    const cursor = el.selectionStart;
    query = el.value;
    render();
    const next = main.querySelector<HTMLInputElement>("#search")!;
    next.focus();
    next.setSelectionRange(cursor, cursor);
  }
});
document.addEventListener("submit", async (event) => {
  const form = event.target as HTMLFormElement;
  if (!form.matches(".record-form,#settings-form,#ai-form")) return;
  event.preventDefault();
  if (!ensureWritable()) return;
  const button = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
  const message = form.querySelector(".form-message");
  if (message) message.textContent = "";
  button.disabled = true;
  try {
    if (form.id === "ai-form") {
      const input = form.querySelector<HTMLTextAreaElement>("textarea")!;
      const prompt = input.value.trim();
      if (!prompt) return;
      const chat = main.querySelector<HTMLDivElement>(".chat-messages")!;
      const q = document.createElement("div");
      q.className = "chat-message user";
      q.textContent = prompt;
      chat.appendChild(q);
      input.value = "";
      const response = document.createElement("div");
      response.className = "chat-message ai";
      response.textContent = "Thinking through your workspace…";
      chat.appendChild(response);
      try {
        const r = await api("ai", "POST", { prompt });
        response.textContent = r.answer;
        data.aiUsage++;
        const sub = main.querySelector(".page-heading p");
        if (sub)
          sub.textContent = `${data.aiUsage} of ${data.limits.ai} requests used today. Your allowance resets at midnight UTC.`;
      } catch (err) {
        response.textContent = (err as Error).message;
      }
      response.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "nearest",
      });
      return;
    }
    const values = Object.fromEntries(new FormData(form));
    if (form.id === "settings-form") {
      await api("settings", "PATCH", values);
      toast("Workspace details saved.");
      await load();
      return;
    }
    const type = form.dataset.record!,
      id = form.dataset.id;
    await api(
      type + (id ? "/" + id : ""),
      id ? "PATCH" : "POST",
      type === "files" ? new FormData(form) : values,
    );
    dialog.close();
    toast(
      type === "files"
        ? "File uploaded securely."
        : "Saved. One less thing to keep in your head.",
    );
    await load();
  } catch (err) {
    if (message) message.textContent = (err as Error).message;
    else toast((err as Error).message);
  } finally {
    button.disabled = false;
  }
});
window.addEventListener("popstate", () => {
  view = new URLSearchParams(location.search).get("view") || "overview";
  render();
});
load();
