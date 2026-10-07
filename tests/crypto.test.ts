import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  checkPassword,
  hashPassword,
  hex,
  renewedExpiry,
  SESSION_IDLE,
  SESSION_MAX,
  timingEqual,
  validStripeSignature,
} from "../src/lib/crypto.ts";
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
test("password hashes record their parameters and verify", async () => {
  const stored = await hashPassword("correct horse battery");
  assert.match(stored, /^pbkdf2-sha256\$100000\$[a-f0-9]{64}\$[a-f0-9]{64}$/);
  assert.deepEqual(await checkPassword("correct horse battery", stored), {
    valid: true,
    outdated: false,
  });
  assert.equal(
    (await checkPassword("correct horse batterY", stored)).valid,
    false,
  );
});
test("older hash formats still verify and are marked for upgrade", async () => {
  const current = await hashPassword("old password", "a".repeat(64));
  const legacy = "a".repeat(64) + ":" + current.split("$")[3];
  assert.deepEqual(await checkPassword("old password", legacy), {
    valid: true,
    outdated: true,
  });
  const weaker = await hashPassword("old password", "b".repeat(64), 1000);
  assert.deepEqual(await checkPassword("old password", weaker), {
    valid: true,
    outdated: true,
  });
  for (const broken of [
    "",
    "test",
    "pbkdf2-sha256$0$" + "a".repeat(64) + "$" + "b".repeat(64),
    "pbkdf2-sha256$100001$" + "a".repeat(64) + "$" + "b".repeat(64),
  ])
    assert.equal((await checkPassword("old password", broken)).valid, false);
});
test("sessions renew daily while used, up to the absolute limit", () => {
  const signIn = 1_790_000_000;
  // Used within a day of the last renewal: no write.
  assert.equal(
    renewedExpiry(signIn + 3600, signIn + SESSION_IDLE, signIn),
    null,
  );
  // Used two days later: seven more days from now.
  const now = signIn + 2 * 86400;
  assert.equal(
    renewedExpiry(now, signIn + SESSION_IDLE, signIn),
    now + SESSION_IDLE,
  );
  // Near the end of the 30 days the expiry stops at the limit, then stops moving.
  const late = signIn + 27 * 86400;
  assert.equal(
    renewedExpiry(late, signIn + 29 * 86400, signIn),
    signIn + SESSION_MAX,
  );
  assert.equal(renewedExpiry(late + 86400, signIn + SESSION_MAX, signIn), null);
});
