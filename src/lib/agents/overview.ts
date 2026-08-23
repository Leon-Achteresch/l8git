import { estimateCost } from "@/lib/agents/token-cost";
import type { AgentWorktree } from "@/lib/agents/agent-worktrees";
import type { NativeAgentProvider } from "@/lib/agents/provider-store";
import type {
  AgentConversation,
  AgentPendingRequest,
  AgentThreadSummary,
} from "@/lib/agents/types";

export type AgentOverviewStatus = "awaitingApproval" | "running" | "failed" | "idle";

export interface AgentOverviewEntry {
  key: string;
  provider: NativeAgentProvider;
  threadId: string;
  path: string;
  repoName: string;
  basePath: string;
  branch: string | null;
  isWorktree: boolean;
  title: string;
  preview: string;
  updatedAt: number;
  status: AgentOverviewStatus;
  pendingRequests: number;
  costUsd: number | null;
  tokens: number;
}

export interface AgentOverviewCounts {
  running: number;
  awaitingApproval: number;
  failed: number;
  idle: number;
  active: number;
}

export interface ProviderOverviewInput {
  threadsByPath: Record<string, AgentThreadSummary[]>;
  conversations: Record<string, AgentConversation>;
  requestsByThread: Record<string, AgentPendingRequest[]>;
}

export interface ThreadCost {
  costUsd: number;
  tokens: number;
}

const STATUS_ORDER: Record<AgentOverviewStatus, number> = {
  awaitingApproval: 0,
  running: 1,
  failed: 2,
  idle: 3,
};

export function isThreadWorking(status: string): boolean {
  return status !== "idle" && status !== "notLoaded";
}

export function overviewRepoName(path: string): string {
  return path.split(/[\\/]/u).filter(Boolean).pop() ?? path;
}

export function overviewStatus(input: {
  threadStatus: string;
  activeTurnId?: string | null;
  pendingRequests?: number;
  error?: string | null;
  lastTurnFailed?: boolean;
}): AgentOverviewStatus {
  if ((input.pendingRequests ?? 0) > 0) return "awaitingApproval";
  if (input.activeTurnId || isThreadWorking(input.threadStatus)) return "running";
  if (input.error || input.lastTurnFailed) return "failed";
  return "idle";
}

export function compareOverviewEntries(left: AgentOverviewEntry, right: AgentOverviewEntry): number {
  return (
    STATUS_ORDER[left.status] - STATUS_ORDER[right.status] ||
    right.updatedAt - left.updatedAt ||
    left.key.localeCompare(right.key)
  );
}

export function sortOverviewEntries(entries: AgentOverviewEntry[]): AgentOverviewEntry[] {
  return [...entries].sort(compareOverviewEntries);
}

export function overviewCounts(entries: AgentOverviewEntry[]): AgentOverviewCounts {
  const counts: AgentOverviewCounts = {
    running: 0,
    awaitingApproval: 0,
    failed: 0,
    idle: 0,
    active: 0,
  };
  for (const entry of entries) counts[entry.status] += 1;
  counts.active = counts.running + counts.awaitingApproval;
  return counts;
}

export function countRunningTurns(
  conversations: Record<string, { activeTurnId: string | null }>,
): number {
  let running = 0;
  for (const conversation of Object.values(conversations)) {
    if (conversation.activeTurnId) running += 1;
  }
  return running;
}

export function countPendingRequests(requestsByThread: Record<string, unknown[]>): number {
  let pending = 0;
  for (const requests of Object.values(requestsByThread)) {
    if (requests && requests.length > 0) pending += 1;
  }
  return pending;
}

export function threadCostKey(provider: NativeAgentProvider, threadId: string): string {
  return `${provider}:${threadId}`;
}

export function buildProviderEntries(
  provider: NativeAgentProvider,
  input: ProviderOverviewInput,
  worktrees: Record<string, AgentWorktree>,
  ledger: Record<string, ThreadCost> = {},
): AgentOverviewEntry[] {
  const entries: AgentOverviewEntry[] = [];
  for (const [path, threads] of Object.entries(input.threadsByPath)) {
    for (const thread of threads) {
      if (thread.archived) continue;
      const conversation = input.conversations[thread.id];
      const pendingRequests = input.requestsByThread[thread.id]?.length ?? 0;
      const worktree = worktrees[path];
      const recorded = ledger[threadCostKey(provider, thread.id)];
      const live = estimateCost(conversation?.tokenUsage, conversation?.model ?? null);
      const liveTokens =
        (conversation?.tokenUsage?.inputTokens ?? 0) + (conversation?.tokenUsage?.outputTokens ?? 0);
      entries.push({
        key: threadCostKey(provider, thread.id),
        provider,
        threadId: thread.id,
        path,
        repoName: overviewRepoName(path),
        basePath: worktree?.basePath ?? path,
        branch: worktree?.branch ?? null,
        isWorktree: Boolean(worktree),
        title: thread.title,
        preview: thread.preview,
        updatedAt: thread.updatedAt,
        status: overviewStatus({
          threadStatus: thread.status,
          activeTurnId: conversation?.activeTurnId ?? null,
          pendingRequests,
          error: conversation?.error ?? null,
          lastTurnFailed:
            conversation?.turns[conversation.turns.length - 1]?.status === "failed",
        }),
        pendingRequests,
        costUsd: recorded?.costUsd ?? live?.totalUsd ?? null,
        tokens: Math.max(recorded?.tokens ?? 0, liveTokens),
      });
    }
  }
  return entries;
}

export function knownPathEntries(
  entries: AgentOverviewEntry[],
  paths: string[],
): AgentOverviewEntry[] {
  if (!paths.length) return entries;
  const known = new Set(paths);
  return entries.filter((entry) => known.has(entry.path));
}

export function filterOverviewEntries(
  entries: AgentOverviewEntry[],
  query: string,
): AgentOverviewEntry[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return entries;
  return entries.filter(
    (entry) =>
      entry.title.toLocaleLowerCase().includes(needle) ||
      entry.preview.toLocaleLowerCase().includes(needle) ||
      entry.repoName.toLocaleLowerCase().includes(needle) ||
      (entry.branch?.toLocaleLowerCase().includes(needle) ?? false),
  );
}
