import type { ReviewThread } from "@/lib/github-expansion/api";
import { applySelectedSuggestions, type SelectedSuggestion } from "@/lib/github-expansion/suggestions";
import { splitCommentBody } from "@/lib/pr-suggestions";
import type { DiffLine } from "@/lib/unified-diff";

import { headLinesFromPatch } from "./diff-ranges";

export type BatchRejection = "outdated" | "oldSide" | "notInDiff" | "noPatch";
export type BatchCandidate = {
  id: string; threadId: string; file: string; startLine: number; endLine: number;
  author: string; url: string; resolved: boolean; replacementLines: string[];
  /** Reviewed-head text of the range, taken from the provider patch; null when rejected. */
  expectedLines: string[] | null; rejection: BatchRejection | null;
};

/** Every suggestion block of every loaded comment, anchored only to real reviewed-head diff lines. */
export function collectCandidates(threads: Iterable<ReviewThread>, patchLines: (file: string) => readonly DiffLine[] | null): BatchCandidate[] {
  const out: BatchCandidate[] = [];
  for (const t of threads) {
    for (const c of t.comments.nodes) {
      splitCommentBody(c.body).forEach((seg, i) => {
        if (seg.kind !== "suggestion") return;
        const endLine = t.line ?? 0, startLine = t.startLine ?? endLine;
        const base = { id: `${c.id}#${i}`, threadId: t.id, file: t.path, startLine, endLine, author: c.author?.login ?? "", url: c.url, resolved: t.isResolved, replacementLines: seg.lines.map((l) => l.replace(/\r$/, "")) };
        let rejection: BatchRejection | null = null, expectedLines: string[] | null = null;
        // Outdated threads carry no current line; never fall back to original_line positions.
        if (t.isOutdated || t.line == null) rejection = "outdated";
        // Ranges must start on the new side too; an unknown start side is not assumed.
        else if (t.diffSide !== "RIGHT" || (t.startLine != null && t.startDiffSide !== "RIGHT")) rejection = "oldSide";
        else {
          const lines = patchLines(t.path);
          if (!lines) rejection = "noPatch";
          else {
            expectedLines = headLinesFromPatch(lines, startLine, endLine);
            if (!expectedLines) rejection = "notInDiff";
          }
        }
        out.push({ ...base, expectedLines, rejection });
      });
    }
  }
  return out;
}

export const toSelected = (c: BatchCandidate): SelectedSuggestion => ({ id: c.id, file: c.file, startLine: c.startLine, endLine: c.endLine, expectedLines: c.expectedLines ?? [], replacementLines: c.replacementLines });

/** True when some thread has more comments than were loaded, so suggestions may be missing. */
export const hasPartialComments = (threads: Iterable<ReviewThread>) => [...threads].some((t) => t.comments.pageInfo.hasNextPage);

/** Ids of selected suggestions whose line ranges intersect another selected one in the same file. */
export function findOverlaps(selected: readonly SelectedSuggestion[]): Set<string> {
  const ids = new Set<string>();
  for (let i = 0; i < selected.length; i++) for (let j = i + 1; j < selected.length; j++) {
    const a = selected[i], b = selected[j];
    if (a.file === b.file && a.startLine <= b.endLine && b.startLine <= a.endLine) { ids.add(a.id); ids.add(b.id); }
  }
  return ids;
}

/** Per-suggestion check against the current local file with the canonical applier: which ones are stale. */
export function staleSuggestions(content: string, suggestions: readonly SelectedSuggestion[]): Map<string, string> {
  const stale = new Map<string, string>();
  for (const s of suggestions) {
    try { applySelectedSuggestions(content, [s]); } catch (e) { stale.set(s.id, e instanceof Error ? e.message : String(e)); }
  }
  return stale;
}

/** Zero-context unified diff of exactly the planned replacements, built from the plan's own before content. */
export function planUnifiedDiff(before: string, suggestions: readonly SelectedSuggestion[]): string {
  const lines = before.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let offset = 0;
  for (const s of [...suggestions].sort((a, b) => a.startLine - b.startLine)) {
    const n = s.endLine - s.startLine + 1, m = s.replacementLines.length;
    const newStart = s.startLine + offset;
    out.push(`@@ -${s.startLine},${n} +${m === 0 ? newStart - 1 : newStart},${m} @@`);
    for (const l of lines.slice(s.startLine - 1, s.endLine)) out.push(`-${l}`);
    for (const l of s.replacementLines) out.push(`+${l}`);
    offset += m - n;
  }
  return out.join("\n");
}
