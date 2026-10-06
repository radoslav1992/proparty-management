import assert from "node:assert/strict";
import { chromium } from "playwright";
// Browser smoke test: every page renders without script errors or CSP violations, and a new user can add a property.
const base = process.env.TEST_BASE_URL || "http://localhost:8787";
const browser = await chromium.launch();
const problems = [];
const page = await browser.newPage();
page.on("pageerror", (e) => problems.push("page error: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error") problems.push("console: " + m.text());
});
try {
  for (const path of ["/", "/login", "/signup", "/privacy", "/verify-email"])
    await page.goto(base + path, { waitUntil: "networkidle" });
  await page.goto(base + "/demo");
  await page.waitForSelector(".stat-grid");
  for (const view of [
    "properties",
    "tenants",
    "leases",
    "rent",
    "maintenance",
    "expenses",
    "documents",
    "reports",
    "assistant",
    "settings",
  ]) {
    await page.locator(`.sidebar [data-view="${view}"]`).first().click();
    await page.waitForURL(`**view=${view}`);
  }
  await page.locator('.sidebar [data-view="properties"]').first().click();
  await page.locator('[data-action="property-detail"]').first().click();
  await page.waitForSelector("#editor[open] h2#editor-title");
  await page.keyboard.press("Escape");
  // The sample data has one part-paid charge, so the ledger shows arrears and a statement.
  await page.locator('.sidebar [data-view="rent"]').first().click();
  await page.waitForSelector(".arrears");
  await page.locator('[data-action="tenant-statement"]').first().click();
  await page.waitForSelector("#editor[open] .statement");
  await page.keyboard.press("Escape");
  await page.goto(base + "/signup");
  await page.fill("[name=name]", "Smoke Test");
  await page.fill("[name=email]", `smoke-${Date.now()}@example.com`);
  await page.fill("[name=password]", "A valid test password 123");
  await page.click("button[type=submit]");
  await page.waitForURL("**/app");
  await page.waitForSelector(".stat-grid");
  await page.locator('[data-action="new-properties"]').first().click();
  await page.fill("#editor [name=name]", "Smoke Flat");
  await page.fill("#editor [name=address]", "1 Smoke Street");
  await page.fill("#editor [name=city]", "Sofia");
  await page.click("#editor button[type=submit]");
  await page.waitForSelector(".property-card h3:text('Smoke Flat')");
  assert.deepEqual(problems, []);
  console.log("PASS: browser smoke test of public pages, demo and sign-up.");
} finally {
  await browser.close();
}
