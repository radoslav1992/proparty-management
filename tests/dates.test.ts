import test from "node:test";
import assert from "node:assert/strict";
import { localDate, monthLabel } from "../src/lib/dates.ts";
test("month labels stay in their month west of UTC", () => {
  process.env.TZ = "America/New_York";
  assert.equal(monthLabel("2026-10", { month: "short" }), "Oct");
  assert.equal(
    monthLabel("2026-10", { month: "long", year: "numeric" }),
    "October 2026",
  );
});
test("today follows the local calendar day east of UTC", () => {
  process.env.TZ = "Europe/Sofia";
  // 01:30 on 6 October in Sofia is still 5 October in UTC.
  assert.equal(localDate(new Date("2026-10-05T22:30:00Z")), "2026-10-06");
  assert.equal(localDate(new Date("2026-02-28T22:30:00Z")), "2026-03-01");
});
