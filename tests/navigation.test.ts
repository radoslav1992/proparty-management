import test from "node:test";
import assert from "node:assert/strict";
import { afterSignIn, signInFor } from "../src/lib/navigation.ts";
test("sign-in returns only to workspace paths", () => {
  assert.equal(afterSignIn("/app?view=rent"), "/app?view=rent");
  assert.equal(afterSignIn("/app"), "/app");
  for (const next of [
    null,
    "",
    "https://evil.example/app",
    "//evil.example",
    "/\\evil.example",
    "/apple",
    "/api/workspace",
    "javascript:alert(1)",
  ])
    assert.equal(afterSignIn(next), "/app", String(next));
});
test("the sign-in link remembers the workspace view", () => {
  assert.equal(signInFor("/app"), "/login");
  assert.equal(signInFor("/app?view=rent"), "/login?next=%2Fapp%3Fview%3Drent");
  assert.equal(
    afterSignIn(
      new URLSearchParams(signInFor("/app?view=rent").split("?")[1]).get(
        "next",
      ),
    ),
    "/app?view=rent",
  );
});
