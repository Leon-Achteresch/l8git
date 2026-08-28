// Block splitting for streamed Markdown answers. Plain TypeScript so it can
// be unit-tested without pulling the renderer in.

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const LIST_ITEM = /^\s{0,3}(?:[-*+]|\d{1,9}[.)])(?:\s|$)/;
const QUOTE = /^\s{0,3}>/;
const INDENTED = /^\s{2,}\S/;
// Link-reference and footnote definitions resolve across the whole document,
// so a split would strip their targets. Rare in agent output, and cheap to
// detect — when present the document is parsed whole.
const DEFINITIONS = /^\s{0,3}\[[^\]]+\]:/m;

type BlockKind = "list" | "quote" | "other";

function kindOf(line: string): BlockKind {
  if (LIST_ITEM.test(line)) return "list";
  if (QUOTE.test(line)) return "quote";
  return "other";
}

/**
 * Splits a document into independently parseable blocks.
 *
 * An answer streams in one token batch at a time, and handing the whole
 * document to the parser on every batch is quadratic in its length — the cost
 * that makes a long reply stutter as it lands. Split this way, every block but
 * the last is byte-identical between batches and keeps its memoized parse.
 *
 * A blank line only ends a block when what follows cannot continue it: a loose
 * list stays one list (splitting it would restart ordered numbering), a
 * multi-paragraph quote stays one quote, and fenced code is never cut.
 */
export function splitMarkdownBlocks(source: string): string[] {
  if (DEFINITIONS.test(source)) return [source];

  const lines = source.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  let currentKind: BlockKind = "other";
  let fence: string | null = null;
  let pendingBlanks = 0;

  const flush = () => {
    if (current.length === 0) return;
    blocks.push(current.join("\n"));
    current = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fenceMatch = FENCE.exec(line);

    if (fence) {
      current.push(line);
      // A closing fence uses the same character and is at least as long.
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) {
        fence = null;
      }
      continue;
    }

    if (line.trim() === "") {
      if (current.length > 0) pendingBlanks += 1;
      continue;
    }

    if (pendingBlanks > 0) {
      const continues =
        (currentKind === "list" && (LIST_ITEM.test(line) || INDENTED.test(line))) ||
        (currentKind === "quote" && QUOTE.test(line));
      if (continues) {
        for (let blank = 0; blank < pendingBlanks; blank += 1) current.push("");
      } else {
        flush();
      }
      pendingBlanks = 0;
    }

    if (current.length === 0) currentKind = kindOf(line);
    current.push(line);
    if (fenceMatch) fence = fenceMatch[1];
  }

  flush();
  return blocks;
}
