import type { StatusEntry } from "@/lib/repo-store";

export type ChangeSector = "staged" | "unstaged" | "conflict";

export type ChangeRow = {
  id: string;
  path: string;
  sector: ChangeSector;
  entry: StatusEntry;
};

export type CheckState = "checked" | "unchecked" | "indeterminate";

export type FileDiffResponse = {
  staged: string | null;
  unstaged: string | null;
  untracked_plain: string | null;
  is_binary: boolean;
};

export function rowId(path: string, sector: ChangeSector): string {
  return `${path}\n${sector}`;
}

export function checkState(entry: StatusEntry): CheckState {
  if (entry.staged && (entry.unstaged || entry.untracked)) return "indeterminate";
  if (entry.staged) return "checked";
  return "unchecked";
}

// All unmerged XY pairs from git porcelain v1: UU, AA, DD, AU, UA, DU, UD
const CONFLICT_PAIRS = new Set(["UU", "AA", "DD", "AU", "UA", "DU", "UD"]);

export function isConflict(entry: StatusEntry): boolean {
  return CONFLICT_PAIRS.has(entry.index_status + entry.worktree_status);
}

export function buildChangeRows(entries: StatusEntry[]): ChangeRow[] {
  // Visual order: conflicts first, then ALL staged rows, then ALL unstaged rows.
  // Conflict files (status "U") are excluded from staged/unstaged sections.
  // This must match the order in commit-panel-file-list (buildListItems),
  // so that Shift-range selection indexes align with what the user sees.
  const conflicts: ChangeRow[] = [];
  const staged: ChangeRow[] = [];
  const unstaged: ChangeRow[] = [];
  for (const e of entries) {
    if (isConflict(e)) {
      conflicts.push({ id: rowId(e.path, "conflict"), path: e.path, sector: "conflict", entry: e });
      continue;
    }
    if (e.staged) {
      staged.push({ id: rowId(e.path, "staged"), path: e.path, sector: "staged", entry: e });
    }
    if (e.unstaged || e.untracked) {
      unstaged.push({ id: rowId(e.path, "unstaged"), path: e.path, sector: "unstaged", entry: e });
    }
  }
  return [...conflicts, ...staged, ...unstaged];
}
