import assert from "node:assert/strict";
import { chromium } from "playwright";
// Browser smoke test: public pages and the demo render without script errors or CSP violations,
// then a new user walks through every workspace screen.
const base = process.env.TEST_BASE_URL || "http://localhost:8787";
const browser = await chromium.launch();
const problems = [];
const page = await browser.newPage();
page.on("pageerror", (e) => problems.push("page error: " + e.message));
page.on("console", (m) => {
  // Requests the journey expects to fail (a wrong password) are reported by the browser too.
  if (m.type() === "error" && !m.text().startsWith("Failed to load resource"))
    problems.push("console: " + m.text());
});
const go = async (view) => {
  await page.locator(`.sidebar [data-view="${view}"]`).first().click();
  await page.waitForURL(`**view=${view}`);
};
const act = (action) =>
  page.locator(`[data-action="${action}"]`).first().click();
const save = async () => {
  await page.click("#editor button[type=submit]");
  await page.waitForSelector("#editor:not([open])", { state: "attached" });
};
const confirm = async (action) => {
  await act(action);
  await act("confirmed-" + action);
  await page.waitForSelector("#editor:not([open])", { state: "attached" });
};
const seen = (selector) => page.waitForSelector(selector);
const nextYear = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
try {
  for (const path of ["/", "/login", "/signup", "/privacy", "/verify-email"])
    await page.goto(base + path, { waitUntil: "networkidle" });

  // Demo workspace: every view, a dialog, arrears and a statement.
  await page.goto(base + "/demo");
  await seen(".stat-grid");
  for (const view of [
    "properties",
    "tenants",
    "leases",
    "rent",
    "maintenance",
    "expenses",
    "documents",
    "reports",
    "activity",
    "assistant",
    "settings",
  ])
    await go(view);
  await go("properties");
  await act("property-detail");
  await seen("#editor[open] h2#editor-title");
  await page.keyboard.press("Escape");
  await go("rent");
  await seen(".arrears");
  await act("tenant-statement");
  await seen("#editor[open] .statement");
  await page.keyboard.press("Escape");

  // A new account, from first property to an ended lease.
  await page.goto(base + "/signup");
  await page.fill("[name=name]", "Smoke Test");
  await page.fill("[name=email]", `smoke-${Date.now()}@example.com`);
  await page.fill("[name=password]", "A valid test password 123");
  await page.click("button[type=submit]");
  await page.waitForURL("**/app");
  await seen(".stat-grid");

  await act("new-properties");
  await page.fill("#editor [name=name]", "Smoke Flat");
  await page.fill("#editor [name=address]", "1 Smoke Street");
  await page.fill("#editor [name=city]", "Sofia");
  await page.fill("#editor [name=rent]", "750");
  await save();
  await seen(".property-card h3:text('Smoke Flat')");

  await go("tenants");
  await act("new-tenants");
  await page.fill("#editor [name=name]", "Smoke Tenant");
  await page.fill("#editor [name=email]", "tenant@example.com");
  await save();
  await seen("td strong:text('Smoke Tenant')");

  await go("leases");
  await act("new-leases");
  assert.equal(await page.inputValue("#editor [name=rent]"), "750");
  await page.fill("#editor [name=end_date]", nextYear);
  await save();
  await seen("td strong:text('Smoke Flat')");

  await go("rent");
  await act("generate-charges");
  await seen(".badge:text('due')");
  await act("record-payment");
  await page.fill("#editor [name=amount]", "300");
  await save();
  await seen(".badge:text('partial')");
  await act("edit-charges");
  await page.fill("#editor [name=amount]", "700");
  await save();
  await seen("td:text('€700.00')");
  await confirm("delete-payments");
  await seen("text=No payments recorded in this month.");
  await confirm("delete-charges");
  await seen("text=Nothing due here yet.");

  await go("tenants");
  await act("tenant-statement");
  await seen("#editor[open] .statement");
  await page.keyboard.press("Escape");

  await go("maintenance");
  await act("new-maintenance");
  await page.fill("#editor [name=title]", "Boiler check");
  await save();
  await seen(".issue-card h3:text('Boiler check')");

  await go("expenses");
  await act("new-expenses");
  await page.fill("#editor [name=title]", "Plumber visit");
  await page.fill("#editor [name=amount]", "120");
  await save();
  await seen("td strong:text('Plumber visit')");

  await go("documents");
  await act("upload-file");
  await page.setInputFiles(
    "#editor [name=file]",
    "public/images/ns-img-232.webp",
  );
  await save();
  await seen(".file-card img");

  await go("leases");
  await act("edit-leases");
  await page.fill("#editor [name=rent]", "800");
  await save();
  await seen("td:has-text('€800.00')");
  await act("end-lease");
  await save();
  await seen("text=History retained");

  await go("activity");
  await seen("td:has-text('Payment reversed')");
  await go("reports");
  await seen("td strong:text('Smoke Flat')");
  await go("assistant");
  await seen("#ai-form");

  await go("settings");
  await page.fill("#settings-form [name=company]", "Smoke Rentals");
  await page.click("#settings-form button[type=submit]");
  await page.waitForFunction(
    () =>
      document.querySelector("#workspace-name")?.textContent ===
      "Smoke Rentals",
  );
  await page.fill("#password-form [name=current_password]", "not my password");
  await page.fill("#password-form [name=password]", "Another password 456");
  await page.click("#password-form button[type=submit]");
  await seen("#password-form .form-message:text('incorrect')");

  assert.deepEqual(problems, []);
  console.log(
    "PASS: browser smoke test of public pages, the demo and a full workspace journey.",
  );
} finally {
  await browser.close();
}
