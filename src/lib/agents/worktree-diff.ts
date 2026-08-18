import { invoke } from "@/lib/platform/ipc";
import { create } from "zustand";

import {
  loadAgentReviewSummary,
  reviewTotals,
  type AgentReviewSummary,
} from "@/lib/agents/agent-review";
import { useAgentWorktreeStore } from "@/lib/agents/agent-worktrees";
import type { StatusEntry } from "@/lib/repo-store";

const TTL_MS = 20_000;

export interface WorktreeDiffStat {
  files: number;
  additions: number;
  deletions: number;
  loadedAt: number;
}

export function diffStatFromStatus(entries: StatusEntry[], now: number = Date.now()): WorktreeDiffStat {
  let additions = 0;
  let deletions = 0;
  for (const entry of entries) {
    additions += (entry.additions_staged ?? 0) + (entry.additions_unstaged ?? 0);
    deletions += (entry.deletions_staged ?? 0) + (entry.deletions_unstaged ?? 0);
  }
  return { files: entries.length, additions, deletions, loadedAt: now };
}

export function diffStatFromReview(
  summary: AgentReviewSummary,
  now: number = Date.now(),
): WorktreeDiffStat {
  const totals = reviewTotals(summary.files ?? []);
  return { ...totals, loadedAt: now };
}

export function isDiffStatStale(
  stat: WorktreeDiffStat | undefined,
  now: number = Date.now(),
  ttlMs: number = TTL_MS,
): boolean {
  return !stat || now - stat.loadedAt >= ttlMs;
}

interface WorktreeDiffState {
  statsByPath: Record<string, WorktreeDiffStat>;
  refresh: (paths: string[]) => Promise<void>;
}

const inFlight = new Set<string>();

async function loadDiffStat(path: string): Promise<WorktreeDiffStat> {
  const basePath = useAgentWorktreeStore.getState().worktrees[path]?.basePath;
  const summary = basePath
    ? await loadAgentReviewSummary(path, basePath).catch(() => null)
    : null;
  if (summary) return diffStatFromReview(summary);

  const entries = await invoke<StatusEntry[]>("repo_status", { path });
  return diffStatFromStatus(Array.isArray(entries) ? entries : []);
}

export const useWorktreeDiffStore = create<WorktreeDiffState>((set, get) => ({
  statsByPath: {},
  refresh: async (paths) => {
    const now = Date.now();
    const stale = paths.filter(
      (path) => path && !inFlight.has(path) && isDiffStatStale(get().statsByPath[path], now),
    );
    if (!stale.length) return;
    for (const path of stale) inFlight.add(path);
    await Promise.all(
      stale.map(async (path) => {
        try {
          const stat = await loadDiffStat(path);
          set((state) => ({ statsByPath: { ...state.statsByPath, [path]: stat } }));
        } catch {
          set((state) => ({
            statsByPath: {
              ...state.statsByPath,
              [path]: { files: 0, additions: 0, deletions: 0, loadedAt: Date.now() },
            },
          }));
        } finally {
          inFlight.delete(path);
        }
      }),
    );
  },
}));
