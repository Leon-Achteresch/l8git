import type { OverlapResult } from "@/lib/git-expansion";

/** 70: radar scan always asks for active-worktree evidence alongside the committed heads. */
export const radarRequest = (base: string, heads: string[]) => ({ op: "overlap" as const, base, heads, includeWorktrees: true });

/** Worktree overlaps with each path flagged when the overlapping file is an uncommitted (pending) edit there. */
export function worktreeOverlapRows(res: Pick<OverlapResult, "worktrees" | "worktreeOverlaps">) {
  const pending = new Map(res.worktrees.map((w) => [w.path, new Set(w.pendingFiles)]));
  return res.worktreeOverlaps.map((o) => ({ file: o.file, worktrees: o.worktreePaths.map((path) => ({ path, pending: pending.get(path)?.has(o.file) ?? false })) }));
}
