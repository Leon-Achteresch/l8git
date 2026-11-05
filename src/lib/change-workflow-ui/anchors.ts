import type { AnchorObservation, ReviewAnchor } from "@/lib/change-workflow/model";
import { parseUnifiedDiff } from "@/lib/unified-diff";

export type Side = ReviewAnchor["side"];

/** Line number → text for one side of a file patch; only lines the patch actually shows. */
export function patchSideLines(patch: string, side: Side): Map<number, string> {
  const lines = new Map<number, string>();
  for (const line of parseUnifiedDiff(patch)) {
    const no = side === "head" ? line.newLineNo : line.oldLineNo;
    if (no !== undefined && (line.kind === "ctx" || line.kind === (side === "head" ? "add" : "del"))) lines.set(no, line.text);
  }
  return lines;
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Fingerprint of the exact anchored lines; null when any line is not part of the patch. */
export async function anchorFingerprint(patch: string, side: Side, start: number, end: number): Promise<string | null> {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) return null;
  const lines = patchSideLines(patch, side);
  const picked: string[] = [];
  for (let no = start; no <= end; no++) {
    const text = lines.get(no);
    if (text === undefined) return null;
    picked.push(text);
  }
  return sha256(JSON.stringify([side, start, end, picked]));
}

/**
 * Observations for chapterState. A patch of `undefined` means not loaded/failed (unknown);
 * a loaded patch that no longer shows the anchored lines omits the observation (missing).
 */
export async function observeAnchors(anchors: readonly ReviewAnchor[], patches: ReadonlyMap<string, string | undefined>): Promise<AnchorObservation[]> {
  const out: AnchorObservation[] = [];
  for (const a of anchors) {
    const base = { path: a.path, side: a.side, startLine: a.startLine, endLine: a.endLine };
    if (!patches.has(a.path)) continue;
    const patch = patches.get(a.path);
    if (patch === undefined) { out.push({ ...base, contentFingerprint: null }); continue; }
    const fp = await anchorFingerprint(patch, a.side, a.startLine, a.endLine);
    if (fp) out.push({ ...base, contentFingerprint: fp });
  }
  return out;
}
