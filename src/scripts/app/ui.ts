// Template helpers. lit-html escapes every interpolated value, so text from the database is never parsed as HTML.
import { html, nothing } from "lit-html";
import { ifDefined } from "lit-html/directives/if-defined.js";
import { monthLabel } from "../../lib/dates";
import { app } from "./state";

export { monthLabel };
export const cash = (cents: number) =>
  new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: app.data?.user?.currency || "EUR",
    maximumFractionDigits: 2,
  }).format((cents || 0) / 100);
export const dateLabel = (d: string | undefined) =>
  d
    ? new Date(d.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : "—";

export const arrow = html`<span class="glyph" aria-hidden="true">↗</span>`;
export const badge = (text: string, status = text) =>
  html`<span class="badge ${status}">${text.replaceAll("_", " ")}</span>`;
export const btn = (
  label: unknown,
  action: string,
  id = "",
  cls = "button small",
  ariaLabel?: string,
) =>
  html`<button
    class=${cls}
    data-action=${action}
    data-id=${id}
    aria-label=${ifDefined(ariaLabel)}
  >
    ${label}
  </button>`;
export const empty = (
  title: string,
  description: string,
  label?: string,
  action?: string,
) =>
  html`<div class="empty">
    <span class="round-icon">⌂</span>
    <h2>${title}</h2>
    <p>${description}</p>
    ${label && action ? btn(label, action) : nothing}
  </div>`;
export const heading = (
  title: string,
  subtitle: string,
  actions: unknown = nothing,
) =>
  html`<div class="page-heading">
    <div>
      <h1>${title}</h1>
      <p>${subtitle}</p>
    </div>
    <div class="heading-actions">${actions}</div>
  </div>`;
export const stat = (label: string, value: string, note: string, icon = "↗") =>
  html`<article class="stat">
    <div class="stat-top">
      <span>${label}</span
      ><span class="stat-icon" aria-hidden="true">${icon}</span>
    </div>
    <strong>${value}</strong><small>${note}</small>
  </article>`;
export const table = (headers: string[], rows: unknown[]) =>
  html`<div class="panel table-wrap">
    <table>
      <thead>
        <tr>
          ${headers.map((h) => html`<th>${h}</th>`)}
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </div>`;
export const monthPicker = () =>
  html`<input
    type="month"
    id="month-filter"
    aria-label="Reporting month"
    value=${app.month}
    min="2000-01"
    max="2099-12"
  />`;

export interface FieldOptions {
  type?: string;
  required?: boolean;
  min?: string | number;
  max?: string | number;
  step?: string;
  minlength?: number;
  maxlength?: number;
  placeholder?: string;
  accept?: string;
  autocomplete?: string;
}
export const field = (
  label: string,
  name: string,
  value: unknown = "",
  o: FieldOptions = {},
) =>
  html`<label
    >${label}<input
      type=${o.type ?? "text"}
      name=${name}
      value=${value == null ? "" : String(value)}
      ?required=${o.required ?? true}
      min=${ifDefined(o.min)}
      max=${ifDefined(o.max)}
      step=${ifDefined(o.step)}
      minlength=${ifDefined(o.minlength)}
      maxlength=${ifDefined(o.maxlength)}
      placeholder=${ifDefined(o.placeholder)}
      accept=${ifDefined(o.accept)}
      autocomplete=${ifDefined(o.autocomplete)}
  /></label>`;
export const area = (label: string, name: string, value = "") =>
  html`<label
    >${label}<textarea name=${name} maxlength="5000" .value=${value}></textarea>
  </label>`;
export const select = (
  label: string,
  name: string,
  options: readonly (readonly [string, string])[],
  value = "",
) =>
  html`<label
    >${label}<select name=${name} required>
      ${options.map(
        ([v, text]) =>
          html`<option value=${v} ?selected=${v === value}>${text}</option>`,
      )}
    </select></label
  >`;
export const propertySelect = (value = "") =>
  select(
    "Property",
    "property_id",
    app.data.properties.map((p) => [p.id, p.name] as const),
    value,
  );

let toastTimer: ReturnType<typeof setTimeout>;
export function toast(message: string) {
  const box = document.querySelector<HTMLElement>("#toast")!;
  box.textContent = message;
  box.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (box.style.display = "none"), 5000);
}
