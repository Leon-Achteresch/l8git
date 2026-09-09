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
  conversations: Record<string, OverviewConversation>;
  requestsByThread: Record<string, AgentPendingRequest[]>;
}

type OverviewConversation = Pick<AgentConversation, "path" | "title" | "activeTurnId" | "error" | "model" | "tokenUsage"> & {
  turns: readonly { status: string }[];
};

/** Subscribe to overview metadata, excluding streamed message bodies. */
export function createOverviewConversationSelector() {
  let previousInput: Record<string, AgentConversation> | undefined;
  let selected: Record<string, OverviewConversation> = {};
  return ({ conversations }: { conversations: Record<string, AgentConversation> }) => {
    if (conversations === previousInput) return selected;
    const next: Record<string, OverviewConversation> = {};
    let changed = false;
    for (const id in conversations) {
      const conversation = conversations[id];
      const previous = selected[id];
      const lastStatus = conversation.turns[conversation.turns.length - 1]?.status;
      if (previous && (
        conversation === previousInput?.[id] || (
          previous.path === conversation.path &&
          previous.title === conversation.title &&
          previous.activeTurnId === conversation.activeTurnId &&
          previous.error === conversation.error &&
          previous.model === conversation.model &&
          previous.tokenUsage === conversation.tokenUsage &&
          previous.turns[previous.turns.length - 1]?.status === lastStatus
        )
      )) {
        next[id] = previous;
      } else {
        changed = true;
        next[id] = {
          path: conversation.path,
          title: conversation.title,
          activeTurnId: conversation.activeTurnId,
          error: conversation.error,
          model: conversation.model,
          tokenUsage: conversation.tokenUsage,
          turns: lastStatus ? [{ status: lastStatus }] : [],
        };
      }
    }
    if (!changed) {
      for (const id in selected) {
        if (!(id in conversations)) { changed = true; break; }
      }
    }
    previousInput = conversations;
    if (changed) selected = next;
    return selected;
  };
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

export type AgentFleetLane = "needsYou" | "working" | "ready";

export function fleetLaneFor(status: AgentOverviewStatus): AgentFleetLane {
  if (status === "awaitingApproval" || status === "failed") return "needsYou";
  if (status === "running") return "working";
  return "ready";
}

export function groupFleetLanes(entries: AgentOverviewEntry[]): Record<AgentFleetLane, AgentOverviewEntry[]> {
  const lanes: Record<AgentFleetLane, AgentOverviewEntry[]> = {
    needsYou: [],
    working: [],
    ready: [],
  };
  for (const entry of entries) lanes[fleetLaneFor(entry.status)].push(entry);
  return lanes;
}

export type AgentConnectionState = "online" | "reconnecting" | "offline" | "catchingUp";

export type AgentConnectionSignal =
  | { type: "connected" }
  | { type: "reconnecting" }
  | { type: "disconnected" }
  | { type: "sequence"; sequence: number };

export interface AgentConnectionSnapshot {
  state: AgentConnectionState;
  lastSequence: number;
  gapDetected: boolean;
}

export function connectionState(
  events: readonly AgentConnectionSignal[],
): AgentConnectionSnapshot {
  let state: AgentConnectionState = "offline";
  let lastSequence = 0;
  let gapDetected = false;
  let hasSequence = false;

  for (const event of events) {
    switch (event.type) {
      case "disconnected":
        state = "offline";
        break;
      case "reconnecting":
        state = "reconnecting";
        break;
      case "connected":
        state = hasSequence ? "catchingUp" : "online";
        break;
      case "sequence": {
        if (hasSequence && event.sequence > lastSequence + 1) gapDetected = true;
        if (event.sequence > lastSequence) lastSequence = event.sequence;
        hasSequence = true;
        state = "online";
        break;
      }
    }
  }

  return { state, lastSequence, gapDetected };
}

/** Sequence to request a resync snapshot from after reconnecting. */
export function snapshotResumeSequence(snapshot: AgentConnectionSnapshot): number {
  return snapshot.lastSequence + 1;
}

export interface AgentRepoGroup {
  path: string;
  repoName: string;
  entries: AgentOverviewEntry[];
}

export function groupEntriesByRepo(entries: AgentOverviewEntry[]): AgentRepoGroup[] {
  const groups = new Map<string, AgentOverviewEntry[]>();
  for (const entry of entries) {
    const key = entry.basePath || entry.path;
    const list = groups.get(key);
    if (list) list.push(entry);
    else groups.set(key, [entry]);
  }
  return [...groups.entries()].map(([path, items]) => ({
    path,
    repoName: items[0]?.repoName ?? overviewRepoName(path),
    entries: items,
  }));
}
