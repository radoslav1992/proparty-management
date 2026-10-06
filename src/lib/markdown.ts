// A small Markdown subset for assistant answers: paragraphs, headings, bullet and numbered lists,
// **bold**, *italic* and `code`. It returns plain data; the UI turns it into escaped elements.
export interface Inline {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}
export type Block =
  | { type: "p" | "h"; inlines: Inline[] }
  | { type: "ul" | "ol"; items: Inline[][] };

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\s][^*\n]*\*)/g;
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    const t = m[0];
    if (t.startsWith("**")) out.push({ text: t.slice(2, -2), bold: true });
    else if (t.startsWith("`")) out.push({ text: t.slice(1, -1), code: true });
    else out.push({ text: t.slice(1, -1), italic: true });
    last = m.index + t.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length)
      blocks.push({ type: "p", inlines: parseInline(paragraph.join("\n")) });
    paragraph = [];
  };
  for (const line of source.replace(/\r\n?/g, "\n").split("\n")) {
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = /^\s*#{1,6}\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*•+]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: "h", inlines: parseInline(heading[1]) });
    } else if (bullet || numbered) {
      flush();
      const type = bullet ? "ul" : "ol";
      const item = parseInline((bullet ?? numbered)![1]);
      const previous = blocks.at(-1);
      if (previous?.type === type) previous.items.push(item);
      else blocks.push({ type, items: [item] });
    } else paragraph.push(line.trim());
  }
  flush();
  return blocks;
}
