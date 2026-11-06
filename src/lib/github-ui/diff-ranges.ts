import type { DiffLine } from "@/lib/unified-diff";

export type DiffSide = "LEFT" | "RIGHT";
/** A commentable patch line: deleted lines live on the old (LEFT) side, everything else on the new (RIGHT) side. */
export type DiffAnchor = { index: number; hunk: number; side: DiffSide; line: number; text: string };
export type DiffRange = { start: DiffAnchor; end: DiffAnchor };
export type RangeFields = { line: number; side: DiffSide; startLine?: number; startSide?: DiffSide };

export const sideLineKey = (side: DiffSide, line: number) => `${side}:${line}`;

/** Real anchor for patch line `index`, or null for hunk headers/meta lines (never invented). */
export function anchorAt(lines: readonly DiffLine[], index: number): DiffAnchor | null {
  const l = lines[index];
  if (!l || (l.kind !== "add" && l.kind !== "del" && l.kind !== "ctx")) return null;
  const side: DiffSide = l.kind === "del" ? "LEFT" : "RIGHT";
  const line = side === "LEFT" ? l.oldLineNo : l.newLineNo;
  if (line == null) return null;
  let hunk = 0;
  for (let i = 0; i <= index; i++) if (lines[i].kind === "hunk") hunk++;
  return { index, hunk, side, line, text: l.text };
}

/**
 * Normalizes a (possibly reversed) selection into patch order. GitHub needs both ends in one hunk and
 * `start_line < line`; a LEFT→RIGHT range whose old number is not below the new one is unrepresentable.
 */
export function buildRange(a: DiffAnchor, b: DiffAnchor): DiffRange | null {
  const [start, end] = a.index <= b.index ? [a, b] : [b, a];
  if (start.hunk !== end.hunk) return null;
  if (start.index !== end.index && start.line >= end.line) return null;
  return { start, end };
}

export function rangeFields(range: DiffRange): RangeFields {
  const { start, end } = range;
  return start.index === end.index ? { line: end.line, side: end.side } : { line: end.line, side: end.side, startLine: start.line, startSide: start.side };
}

/** Side/line keys of every real anchor inside a patch-ordered range (for highlighting). */
export function rangeKeys(lines: readonly DiffLine[], range: DiffRange): Set<string> {
  const keys = new Set<string>();
  for (let i = range.start.index; i <= range.end.index; i++) {
    const anchor = anchorAt(lines, i);
    if (anchor) keys.add(sideLineKey(anchor.side, anchor.line));
  }
  return keys;
}

/** Keys of a stored range (`startLine..line`) without patch indices: same-side only, mixed sides mark both ends. */
export function storedRangeKeys(r: { line: number; side?: DiffSide | null; startLine?: number | null; startSide?: DiffSide | null }): string[] {
  const side = r.side ?? "RIGHT";
  if (r.startLine == null || r.startLine >= r.line) return [sideLineKey(side, r.line)];
  const startSide = r.startSide ?? side;
  if (startSide !== side) return [sideLineKey(startSide, r.startLine), sideLineKey(side, r.line)];
  return Array.from({ length: Math.min(r.line - r.startLine + 1, 500) }, (_, i) => sideLineKey(side, r.startLine! + i));
}

/** New-side text for lines `start..end` from the reviewed patch; null when any line lacks a real diff anchor. */
export function headLinesFromPatch(lines: readonly DiffLine[], start: number, end: number): string[] | null {
  const byLine = new Map<number, string>();
  for (const l of lines) if ((l.kind === "add" || l.kind === "ctx") && l.newLineNo != null) byLine.set(l.newLineNo, l.text.replace(/\r$/, ""));
  const out: string[] = [];
  for (let n = start; n <= end; n++) {
    const text = byLine.get(n);
    if (text === undefined) return null;
    out.push(text);
  }
  return out;
}
