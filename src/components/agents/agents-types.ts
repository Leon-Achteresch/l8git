import type { StatusEntry } from "@/lib/repo-store";

export type AgentsSelection = { path: string; tabId?: string };

export const AGENTS_EMPTY_STATUS: StatusEntry[] = [];

export function agentsRepoName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function agentsDiffTotals(entries: StatusEntry[]): {
  add: number;
  del: number;
} {
  let add = 0;
  let del = 0;
  for (const e of entries) {
    add += e.additions_staged + e.additions_unstaged;
    del += e.deletions_staged + e.deletions_unstaged;
  }
  return { add, del };
}
