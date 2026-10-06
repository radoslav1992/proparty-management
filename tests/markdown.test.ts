import test from "node:test";
import assert from "node:assert/strict";
import { parseInline, parseMarkdown } from "../src/lib/markdown.ts";
test("inline bold, italic and code are recognised; other text stays text", () => {
  assert.deepEqual(parseInline("Pay **€450** by *Friday* via `IBAN`."), [
    { text: "Pay " },
    { text: "€450", bold: true },
    { text: " by " },
    { text: "Friday", italic: true },
    { text: " via " },
    { text: "IBAN", code: true },
    { text: "." },
  ]);
  assert.deepEqual(parseInline("<b>not html</b> 2 * 3"), [
    { text: "<b>not html</b> 2 * 3" },
  ]);
});
test("blocks: paragraphs, headings and lists", () => {
  const blocks = parseMarkdown(
    "## Overdue\nTwo tenants owe rent.\nSee below.\n\n- Elena: €450\n- Daniel: €0\n\n1. Call\n2. Remind",
  );
  assert.deepEqual(
    blocks.map((b) => b.type),
    ["h", "p", "ul", "ol"],
  );
  assert.deepEqual(blocks[1], {
    type: "p",
    inlines: [{ text: "Two tenants owe rent.\nSee below." }],
  });
  assert.equal(blocks[2].type === "ul" && blocks[2].items.length, 2);
});
