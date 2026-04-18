export type DiffLineKind = "hunk" | "add" | "del" | "ctx" | "meta";

export type DiffLine = { kind: DiffLineKind; text: string };

export function parseUnifiedDiff(text: string): DiffLine[] {
  const lines = text.split("\n");
  const out: DiffLine[] = [];
  for (const line of lines) {
    if (line.startsWith("@@")) {
      out.push({ kind: "hunk", text: line });
    } else if (
      line.startsWith("+++ ") ||
      line.startsWith("--- ") ||
      line.startsWith("diff ") ||
      line.startsWith("index ") ||
      line.startsWith("similarity ") ||
      line.startsWith("rename ")
    ) {
      out.push({ kind: "meta", text: line });
    } else if (line.startsWith("+")) {
      out.push({ kind: "add", text: line.slice(1) });
    } else if (line.startsWith("-")) {
      out.push({ kind: "del", text: line.slice(1) });
    } else if (line.startsWith("\\")) {
      out.push({ kind: "meta", text: line });
    } else if (line.startsWith(" ")) {
      out.push({ kind: "ctx", text: line.slice(1) });
    } else {
      out.push({ kind: "ctx", text: line });
    }
  }
  return out;
}

export function linesFromUntracked(content: string): DiffLine[] {
  return content.split("\n").map((text) => ({ kind: "add" as const, text }));
}
