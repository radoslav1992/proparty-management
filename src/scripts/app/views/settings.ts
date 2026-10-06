import { html, nothing } from "lit-html";
import { CURRENCIES } from "../../../lib/types";
import { app, demo } from "../state";
import { arrow, btn, field, heading, select } from "../ui";

const CURRENCY_NAMES = {
  EUR: "EUR — Euro",
  USD: "USD — US Dollar",
  GBP: "GBP — British Pound",
} as const;
const PLANS = [
  ["landlord", "Landlord", "15 properties · 30 AI requests/day"],
  ["portfolio", "Portfolio", "50 properties · 100 AI requests/day"],
] as const;

export function settings() {
  const d = app.data;
  return html`${heading(
      "Your workspace, your way.",
      "A few details to make this place your own.",
    )}
    <div class="settings-grid">
      <section class="panel">
        <form class="settings-form" id="settings-form">
          <h2>Workspace details</h2>
          ${field("Your name", "name", d.user.name)}${field(
            "Workspace / company name",
            "company",
            d.user.company,
            { required: false },
          )}${select(
            "Report currency",
            "currency",
            CURRENCIES.map((c) => [c, CURRENCY_NAMES[c]] as const),
            d.user.currency,
          )}<small
            >Currency can only change before you add your first property.
            Existing values are never converted.</small
          >
          <div class="form-message" role="alert"></div>
          <button class="button" type="submit">Save changes</button>
        </form>
      </section>
      <section class="panel panel-padding">
        <h2 style="font-size:20px">Your plan</h2>
        <p style="font-size:12px">
          ${d.limits.label} · ${d.properties.length} of ${d.limits.properties}
          properties · ${d.limits.ai} AI requests/day
        </p>
        ${
          d.billingEnabled
            ? nothing
            : html`<div class="note-box">
                Paid upgrades are coming soon. Your free workspace is ready to
                use.
              </div>`
        }
        <div class="plan-options">
          ${PLANS.map(
            ([plan, name, detail]) =>
              html`<div class="plan-option">
                <div><strong>${name}</strong><small>${detail}</small></div>
                <button
                  class="button outline"
                  data-action="checkout"
                  data-id=${plan}
                  ?disabled=${!d.billingEnabled || plan === d.user.plan}
                >
                  ${
                    plan === d.user.plan
                      ? "Current plan"
                      : html`View checkout ${arrow}`
                  }
                </button>
              </div>`,
          )}
        </div>
        ${
          d.user.stripe_subscription_id
            ? btn(
                "Manage subscription",
                "billing-portal",
                "",
                "button small outline",
              )
            : nothing
        }
        <p style="font-size:11px;margin-top:22px">Account: ${d.user.email}</p>
      </section>
      <section class="panel">
        <form class="settings-form" id="password-form">
          <h2>Sign-in and security</h2>
          ${field("Current password", "current_password", "", {
            type: "password",
            autocomplete: "current-password",
            maxlength: 128,
          })}${field("New password", "password", "", {
            type: "password",
            autocomplete: "new-password",
            minlength: 12,
            maxlength: 128,
          })}<small
            >Changing your password signs you out on every other device.</small
          >
          <div class="form-message" role="alert"></div>
          <button class="button" type="submit">Change password</button>${btn(
            "Sign out of other devices",
            "sign-out-others",
            "",
            "button small outline",
          )}
        </form>
      </section>
      <section class="panel panel-padding">
        <h2 style="font-size:20px">Your data</h2>
        <p style="font-size:12px">
          Download everything in your workspace as a JSON file, or delete your
          account with all of its records, documents and photos.
        </p>
        <div class="data-actions">
          ${
            demo
              ? btn(
                  "Download my data",
                  "export-data",
                  "",
                  "button small outline",
                )
              : html`<a
                  class="button small outline"
                  href="/api/account/export"
                  download
                  >Download my data</a
                >`
          }${btn(
            "Delete account",
            "delete-account",
            "",
            "button small outline danger",
          )}
        </div>
      </section>
    </div>`;
}
