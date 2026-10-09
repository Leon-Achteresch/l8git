import type { StatusEntry } from "@/lib/repo-store";
import { isConflict, type ChangeRow, type FileDiffResponse } from "@/components/repo/commit/commit-panel-types";

export function visibleSelectionRange(visibleIds: readonly string[], anchor: string | null, target: string): string[] {
  const targetIndex = visibleIds.indexOf(target);
  if (targetIndex < 0) return [target];
  const anchorIndex = anchor ? visibleIds.indexOf(anchor) : -1;
  if (anchorIndex < 0) return [target];
  return visibleIds.slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1);
}

export function rowStagingAction(row: ChangeRow): "stage" | "unstage" | null {
  if (row.sector === "conflict" || row.entry.embedded_repo) return null;
  return row.sector === "staged" ? "unstage" : "stage";
}

export type DiscardFilePlan = {
  path: string;
  scope: "worktree" | "all";
  entry: StatusEntry;
  diff?: FileDiffResponse;
};
export type DiscardPlan = { repoPath: string; files: DiscardFilePlan[] };

export function makeDiscardPlan(repoPath: string, rows: readonly ChangeRow[]): DiscardPlan {
  const files = new Map<string, DiscardFilePlan>();
  for (const row of rows) {
    if (row.sector === "conflict" || row.entry.embedded_repo) continue;
    const previous = files.get(row.path);
    files.set(row.path, {
      path: row.path,
      scope: previous?.scope === "all" || row.sector === "staged" ? "all" : "worktree",
      entry: { ...row.entry },
    });
  }
  return { repoPath, files: [...files.values()] };
}

export function discardStatusSignature(entry: StatusEntry): string {
  return JSON.stringify([
    entry.path, entry.index_status, entry.worktree_status, entry.staged, entry.unstaged,
    entry.untracked, entry.binary, entry.embedded_repo,
    entry.additions_staged, entry.deletions_staged, entry.additions_unstaged, entry.deletions_unstaged,
  ]);
}

export function changedDiscardPaths(plan: DiscardPlan, current: readonly StatusEntry[]): string[] {
  const entries = new Map(current.map((entry) => [entry.path, entry]));
  return plan.files.flatMap((file) => {
    const next = entries.get(file.path);
    return !next || isConflict(next) || discardStatusSignature(next) !== discardStatusSignature(file.entry) ? [file.path] : [];
  });
}

export function discardPlanGroups(plan: DiscardPlan): { scope: "worktree" | "all"; files: DiscardFilePlan[] }[] {
  return (["worktree", "all"] as const).map((scope) => ({ scope, files: plan.files.filter((file) => file.scope === scope) })).filter((group) => group.files.length > 0);
}

/** Keep each reviewed file's scope while dropping changes that no longer exist. */
export function refreshDiscardPlan(plan: DiscardPlan, current: readonly StatusEntry[]): DiscardPlan {
  const entries = new Map(current.map((entry) => [entry.path, entry]));
  return { ...plan, files: plan.files.flatMap((file) => {
    const entry = entries.get(file.path);
    if (!entry || isConflict(entry) || entry.embedded_repo || (!entry.staged && !entry.unstaged && !entry.untracked) || (file.scope === "worktree" && !entry.unstaged && !entry.untracked)) return [];
    return [{ path: file.path, scope: file.scope, entry: { ...entry } }];
  }) };
}

export function discardContentSignature(file: DiscardFilePlan, diff: FileDiffResponse): string {
  return JSON.stringify([diff.fingerprint, diff.is_binary, file.scope === "all" ? diff.staged : null, diff.unstaged, diff.untracked_plain]);
}

export function discardPlanVerified(plan: DiscardPlan): boolean {
  return plan.files.length > 0 && plan.files.every((file) => typeof file.diff?.fingerprint === "string" && file.diff.fingerprint.trim().length > 0);
}

export async function captureDiscardDiffs(plan: DiscardPlan, read: (file: DiscardFilePlan) => Promise<FileDiffResponse>): Promise<DiscardPlan> {
  const files: DiscardFilePlan[] = [];
  for (let i = 0; i < plan.files.length; i += 4) {
    files.push(...await Promise.all(plan.files.slice(i, i + 4).map(async (file) => ({ ...file, diff: await read(file) }))));
  }
  return { ...plan, files };
}

export function changedDiscardContents(expected: DiscardPlan, fresh: DiscardPlan): string[] {
  const files = new Map(fresh.files.map((file) => [file.path, file]));
  return expected.files.flatMap((file) => {
    const next = files.get(file.path);
    return !file.diff?.fingerprint || !next?.diff?.fingerprint || discardContentSignature(file, file.diff) !== discardContentSignature(file, next.diff) ? [file.path] : [];
  });
}

export function discardFileTotals(file: DiscardFilePlan): { additions: number; deletions: number } {
  return {
    additions: (file.scope === "all" ? file.entry.additions_staged : 0) + file.entry.additions_unstaged,
    deletions: (file.scope === "all" ? file.entry.deletions_staged : 0) + file.entry.deletions_unstaged,
  };
}
