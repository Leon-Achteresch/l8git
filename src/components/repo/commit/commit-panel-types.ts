import type { StatusEntry } from "@/lib/repo-store";

export type ChangeSector = "staged" | "unstaged";

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

export function buildChangeRows(entries: StatusEntry[]): ChangeRow[] {
  const rows: ChangeRow[] = [];
  for (const e of entries) {
    if (e.staged) {
      rows.push({ id: rowId(e.path, "staged"), path: e.path, sector: "staged", entry: e });
    }
    if (e.unstaged || e.untracked) {
      rows.push({ id: rowId(e.path, "unstaged"), path: e.path, sector: "unstaged", entry: e });
    }
  }
  return rows;
}
