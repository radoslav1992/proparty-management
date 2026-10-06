import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { hex, timingEqual, validStripeSignature } from "../src/lib/crypto.ts";
const secret = "whsec_test";
const body = '{"id":"evt_1","type":"customer.subscription.updated"}';
const now = 1_790_000_000;
const sign = (payload: string, t: number, key = secret) =>
  createHmac("sha256", key).update(`${t}.${payload}`).digest("hex");
test("hex encodes only the bytes a view covers", () => {
  const bytes = new Uint8Array([0, 1, 254, 255]);
  assert.equal(hex(bytes), "0001feff");
  assert.equal(hex(bytes.subarray(2)), "feff");
  assert.equal(hex(bytes.buffer), "0001feff");
});
test("timingEqual compares whole strings", () => {
  assert.equal(timingEqual("abc", "abc"), true);
  assert.equal(timingEqual("abc", "abd"), false);
  assert.equal(timingEqual("abc", "abcd"), false);
});
test("a correctly signed recent Stripe event is accepted", async () => {
  const header = `t=${now},v1=${sign(body, now)}`;
  assert.equal(await validStripeSignature(body, header, secret, now), true);
  // During secret rotation Stripe sends several v1 signatures.
  const rotated = `t=${now},v1=${sign(body, now, "old")},v1=${sign(body, now)}`;
  assert.equal(await validStripeSignature(body, rotated, secret, now), true);
});
test("forged, altered, stale or malformed signatures are rejected", async () => {
  const good = sign(body, now);
  const cases = [
    `t=${now},v1=${sign(body, now, "wrong secret")}`,
    `t=${now},v1=${sign(body + " ", now)}`,
    `t=${now - 301},v1=${sign(body, now - 301)}`,
    `v1=${good}`,
    `t=abc,v1=${good}`,
    `t=${now},v0=${good}`,
    "",
  ];
  for (const header of cases)
    assert.equal(
      await validStripeSignature(body, header, secret, now),
      false,
      header,
    );
});
