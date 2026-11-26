import type { DiffLine } from "@/lib/unified-diff";

export type DiffSide = "LEFT" | "RIGHT";
/** A commentable patch line: deleted lines live on the old (LEFT) side, everything else on the new (RIGHT) side. */
export type DiffAnchor = { index: number; hunk: number; side: DiffSide; line: number; text: string };
export type DiffRange = { start: DiffAnchor; end: DiffAnchor };
export type RangeFields = { line: number; side: DiffSide; startLine?: number; startSide?: DiffSide };

export const sideLineKey = (side: DiffSide, line: number) => `${side}:${line}`;

export function indexDiffHunks(lines: readonly DiffLine[]): Uint32Array {
  const hunks = new Uint32Array(lines.length);
  let hunk = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].kind === "hunk") hunk++;
    hunks[i] = hunk;
  }
  return hunks;
}

/** Real anchor for patch line `index`, or null for hunk headers/meta lines (never invented). */
export function anchorAt(lines: readonly DiffLine[], index: number, hunks = indexDiffHunks(lines)): DiffAnchor | null {
  const l = lines[index];
  if (!l || (l.kind !== "add" && l.kind !== "del" && l.kind !== "ctx")) return null;
  const side: DiffSide = l.kind === "del" ? "LEFT" : "RIGHT";
  const line = side === "LEFT" ? l.oldLineNo : l.newLineNo;
  if (line == null) return null;
  return { index, hunk: hunks[index], side, line, text: l.text };
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

type StoredRange = { line: number; side?: DiffSide | null; startLine?: number | null; startSide?: DiffSide | null };
type LineInterval = { first: number; last: number };

/** Compact intervals keep a long reviewed range fully highlighted as rows scroll into view. */
export function indexReviewedRanges(ranges: readonly StoredRange[]) {
  const bySide: Record<DiffSide, LineInterval[]> = { LEFT: [], RIGHT: [] };
  for (const range of ranges) {
    const side = range.side ?? "RIGHT";
    const startSide = range.startSide ?? side;
    const first = range.startLine ?? range.line;
    if (startSide !== side && first < range.line) bySide[startSide].push({ first, last: first });
    bySide[side].push({ first: startSide === side ? Math.min(first, range.line) : range.line, last: range.line });
  }
  for (const intervals of Object.values(bySide)) {
    intervals.sort((a, b) => a.first - b.first);
    // A binary search can then answer containment even for overlapping or nested ranges.
    let furthest = 0;
    for (const interval of intervals) {
      furthest = Math.max(furthest, interval.last);
      interval.last = furthest;
    }
  }
  return (side: DiffSide, line: number) => {
    const intervals = bySide[side];
    let low = 0;
    let high = intervals.length;
    while (low < high) {
      const mid = low + Math.floor((high - low) / 2);
      if (intervals[mid].first <= line) low = mid + 1;
      else high = mid;
    }
    return low > 0 && intervals[low - 1].last >= line;
  };
}

// Each parsed patch is an immutable snapshot. Reuse its index while review threads reference it.
const headLineIndexes = new WeakMap<readonly DiffLine[], ReadonlyMap<number, string>>();

/** New-side text for lines `start..end` from the reviewed patch; null when any line lacks a real diff anchor. */
export function headLinesFromPatch(lines: readonly DiffLine[], start: number, end: number): string[] | null {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start) return null;
  let byLine = headLineIndexes.get(lines);
  if (!byLine) {
    const index = new Map<number, string>();
    for (const line of lines) {
      if ((line.kind === "add" || line.kind === "ctx") && line.newLineNo != null) {
        index.set(line.newLineNo, line.text.replace(/\r$/, ""));
      }
    }
    byLine = index;
    headLineIndexes.set(lines, index);
  }
  const out: string[] = [];
  for (let n = start; n <= end; n++) {
    const text = byLine.get(n);
    if (text === undefined) return null;
    out.push(text);
  }
  return out;
}
