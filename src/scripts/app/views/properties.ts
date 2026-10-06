import { html } from "lit-html";
import type { Property } from "../../../lib/types";
import { activeLease, app, tenant } from "../state";
import { badge, btn, cash, empty, heading } from "../ui";

export function propertyCard(p: Property) {
  const l = activeLease(p.id),
    t = l && tenant(l.tenant_id);
  const photo = app.data.files.find(
    (f) => f.property_id === p.id && f.kind === "image",
  );
  const image = photo ? "/api/files/" + photo.id : p.demo_image;
  return html`<article class="property-card">
    <div class="property-image">
      ${
        image
          ? html`<img src=${image} alt=${p.name} loading="lazy" />`
          : html`<span class="placeholder">⌂</span>`
      }
      ${badge(l ? "Occupied" : "Vacant", l ? "green" : "vacant")}
    </div>
    <div class="property-card-content">
      <h3>${p.name}</h3>
      <p>${p.address}, ${p.city}</p>
      <div class="property-meta">
        <span>${p.bedrooms} bed${p.bedrooms === 1 ? "" : "s"}</span
        ><span>${p.area} m²</span><span>${p.type}</span>
      </div>
      <div class="property-card-bottom">
        <strong
          >${cash(l?.rent_cents || p.rent_cents)}<small> / month</small></strong
        >${btn("↗", "property-detail", p.id, "icon-button", `Open ${p.name}`)}
      </div>
      <small style="display:block;margin-top:10px"
        >${t ? t.name : "Ready for your next tenant"}</small
      >
    </div>
  </article>`;
}

export function properties() {
  const q = app.query.toLowerCase();
  const rows = app.data.properties.filter(
    (p) =>
      `${p.name} ${p.address} ${p.city}`.toLowerCase().includes(q) &&
      (app.filter === "all" ||
        (app.filter === "occupied") === !!activeLease(p.id)),
  );
  return html`${heading(
      "Every property. One place.",
      "Your rental portfolio, organised around the details that matter.",
      btn("+ Add property", "new-properties"),
    )}
    <div class="toolbar">
      <input
        id="search"
        aria-label="Search properties"
        placeholder="Search by name, address or city…"
        .value=${app.query}
      /><select id="status-filter" aria-label="Occupancy">
        <option value="all" ?selected=${app.filter === "all"}>
          All properties
        </option>
        <option value="occupied" ?selected=${app.filter === "occupied"}>
          Occupied
        </option>
        <option value="vacant" ?selected=${app.filter === "vacant"}>
          Vacant
        </option>
      </select>
    </div>
    ${
      rows.length
        ? html`<div class="property-grid">${rows.map(propertyCard)}</div>`
        : empty(
            "A little room to grow.",
            app.data.properties.length
              ? "No properties match this search."
              : "Add your first property to start bringing everything together.",
            "Add property",
            "new-properties",
          )
    }`;
}
