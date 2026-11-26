import type { StatusEntry } from "./repo-store";

export function sameStatusEntries(previous: readonly StatusEntry[] | undefined, next: readonly StatusEntry[]): boolean {
  if (previous === next) return true;
  if (!previous || previous.length !== next.length) return false;
  for (let i = 0; i < next.length; i++) {
    const a = previous[i];
    const b = next[i];
    if (a.path !== b.path || a.index_status !== b.index_status || a.worktree_status !== b.worktree_status ||
        a.staged !== b.staged || a.unstaged !== b.unstaged || a.untracked !== b.untracked ||
        a.binary !== b.binary || a.embedded_repo !== b.embedded_repo ||
        a.additions_staged !== b.additions_staged || a.deletions_staged !== b.deletions_staged ||
        a.additions_unstaged !== b.additions_unstaged || a.deletions_unstaged !== b.deletions_unstaged) return false;
  }
  return true;
}
