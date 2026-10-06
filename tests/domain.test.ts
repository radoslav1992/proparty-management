import test from "node:test";
import assert from "node:assert/strict";
import {
  money,
  date,
  month,
  chargeDue,
  csvCell,
  integer,
  subscriptionPlan,
  subscriptionEnded,
} from "../src/lib/domain.ts";
test("money preserves cents and rejects ambiguous or negative input", () => {
  assert.equal(money("850.25"), 85025);
  assert.equal(money("0", true), 0);
  for (const value of ["-1", "12.999", "1e3", "NaN", "", null])
    assert.throws(() => money(value));
});
test("dates reject rollover and preserve leap days", () => {
  assert.equal(date("2024-02-29"), "2024-02-29");
  assert.throws(() => date("2026-02-29"));
  assert.throws(() => date("2026-04-31"));
  assert.throws(() => date("invalid"));
});
test("month and due-day validation protect recurring charges", () => {
  assert.equal(month("2026-10"), "2026-10");
  assert.throws(() => month("2026-13"));
  assert.equal(chargeDue("2026-10", 1, "2026-10-15"), "2026-10-15");
  assert.equal(chargeDue("2026-10", 5, "2026-01-01"), "2026-10-05");
  assert.equal(
    chargeDue("2026-03", 15, "2026-01-01", "2026-03-05"),
    "2026-03-05",
  );
  assert.throws(() => integer(29, 1, 28));
});
test("CSV neutralises formulas and escapes quotes", () => {
  assert.equal(csvCell("=SUM(A1:A2)"), `"'=SUM(A1:A2)"`);
  assert.equal(csvCell('a"b'), '"a""b"');
  assert.equal(csvCell(120), '"120"');
});
test("only active subscriptions with a known price grant a paid plan", () => {
  const prices = { landlord: "price_l", portfolio: "price_p" };
  assert.equal(subscriptionPlan("active", "price_p", prices), "portfolio");
  assert.equal(subscriptionPlan("trialing", "price_l", prices), "landlord");
  assert.equal(subscriptionPlan("past_due", "price_l", prices), "free");
  assert.equal(subscriptionPlan("active", "price_other", prices), "free");
  assert.equal(subscriptionPlan("active", undefined, {}), "free");
});
test("past-due subscriptions still block a second checkout", () => {
  assert.equal(subscriptionEnded("past_due"), false);
  assert.equal(subscriptionEnded("unpaid"), false);
  assert.equal(subscriptionEnded("canceled"), true);
  assert.equal(subscriptionEnded("incomplete_expired"), true);
});
