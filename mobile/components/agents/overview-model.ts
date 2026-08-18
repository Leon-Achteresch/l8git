import type { AgentOverviewCounts, AgentOverviewStatus } from '@desktop/lib/agents/overview';

import type { HostAgentEntry } from '~/lib/agents/overview-aggregator';
import type { NativeAgentProvider } from '~/lib/agents/stores';

export const AGENT_STATUS_FILTERS = [
  'all',
  'awaitingApproval',
  'running',
  'failed',
  'idle',
] as const;

export type AgentStatusFilter = (typeof AGENT_STATUS_FILTERS)[number];

export interface AgentOverviewFilters {
  status: AgentStatusFilter;
  provider: NativeAgentProvider | 'all';
  hostId: string | 'all';
}

export const DEFAULT_AGENT_FILTERS: AgentOverviewFilters = {
  status: 'all',
  provider: 'all',
  hostId: 'all',
};

export function isDefaultFilters(filters: AgentOverviewFilters): boolean {
  return (
    filters.status === 'all' && filters.provider === 'all' && filters.hostId === 'all'
  );
}

export interface AgentRepoGroup {
  key: string;
  hostId: string;
  hostName: string;
  path: string;
  repoName: string;
  branch: string | null;
  isWorktree: boolean;
  stale: boolean;
  updatedAt: number;
  entries: HostAgentEntry[];
  counts: AgentOverviewCounts;
}

const STATUS_WEIGHT: Record<AgentOverviewStatus, number> = {
  awaitingApproval: 0,
  running: 1,
  failed: 2,
  idle: 3,
};

function emptyCounts(): AgentOverviewCounts {
  return { running: 0, awaitingApproval: 0, failed: 0, idle: 0, active: 0 };
}

export function countByStatus(entries: readonly HostAgentEntry[]): AgentOverviewCounts {
  const counts = emptyCounts();
  for (const entry of entries) {
    counts[entry.status] += 1;
  }
  counts.active = counts.running + counts.awaitingApproval;
  return counts;
}

export function countByProvider(
  entries: readonly HostAgentEntry[]
): Record<NativeAgentProvider, number> {
  const counts = { codex: 0, claude: 0, cursor: 0, opencode: 0 };
  for (const entry of entries) {
    counts[entry.provider] += 1;
  }
  return counts;
}

export function countByHost(entries: readonly HostAgentEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    counts[entry.hostId] = (counts[entry.hostId] ?? 0) + 1;
  }
  return counts;
}

export function applyAgentFilters(
  entries: readonly HostAgentEntry[],
  filters: AgentOverviewFilters
): HostAgentEntry[] {
  return entries.filter((entry) => {
    if (filters.status !== 'all' && entry.status !== filters.status) {
      return false;
    }
    if (filters.provider !== 'all' && entry.provider !== filters.provider) {
      return false;
    }
    if (filters.hostId !== 'all' && entry.hostId !== filters.hostId) {
      return false;
    }
    return true;
  });
}

export function needsAttention(entry: HostAgentEntry): boolean {
  return entry.status === 'awaitingApproval' || entry.status === 'failed';
}

export function attentionEntries(entries: readonly HostAgentEntry[]): HostAgentEntry[] {
  return entries.filter(needsAttention);
}

export function pendingApprovals(entries: readonly HostAgentEntry[]): number {
  let pending = 0;
  for (const entry of entries) {
    pending += entry.pendingRequests;
  }
  return pending;
}

export function totalCostUsd(entries: readonly HostAgentEntry[]): number {
  let total = 0;
  for (const entry of entries) {
    total += entry.costUsd ?? 0;
  }
  return total;
}

export function totalTokens(entries: readonly HostAgentEntry[]): number {
  let total = 0;
  for (const entry of entries) {
    total += entry.tokens;
  }
  return total;
}

export function groupEntriesByRepo(entries: readonly HostAgentEntry[]): AgentRepoGroup[] {
  const groups = new Map<string, AgentRepoGroup>();
  for (const entry of entries) {
    const key = `${entry.hostId}:${entry.path}`;
    const group = groups.get(key);
    if (group) {
      group.entries.push(entry);
      group.updatedAt = Math.max(group.updatedAt, entry.updatedAt);
      continue;
    }
    groups.set(key, {
      key,
      hostId: entry.hostId,
      hostName: entry.hostName,
      path: entry.path,
      repoName: entry.repoName,
      branch: entry.branch,
      isWorktree: entry.isWorktree,
      stale: entry.stale,
      updatedAt: entry.updatedAt,
      entries: [entry],
      counts: emptyCounts(),
    });
  }

  const result = [...groups.values()];
  for (const group of result) {
    group.entries.sort(
      (left, right) =>
        STATUS_WEIGHT[left.status] - STATUS_WEIGHT[right.status] ||
        right.updatedAt - left.updatedAt ||
        left.key.localeCompare(right.key)
    );
    group.counts = countByStatus(group.entries);
  }

  return result.sort(
    (left, right) =>
      right.counts.awaitingApproval - left.counts.awaitingApproval ||
      right.counts.running - left.counts.running ||
      right.updatedAt - left.updatedAt ||
      left.repoName.localeCompare(right.repoName)
  );
}

export function agentTimestampMs(updatedAt: number): number {
  if (!updatedAt) {
    return 0;
  }
  return updatedAt > 1e11 ? updatedAt : updatedAt * 1000;
}

export function formatTokens(tokens: number): string | null {
  if (tokens <= 0) {
    return null;
  }
  if (tokens < 1000) {
    return `${tokens} tok`;
  }
  if (tokens < 1_000_000) {
    const value = tokens / 1000;
    return `${value >= 100 ? Math.round(value) : value.toFixed(1)}k tok`;
  }
  return `${(tokens / 1_000_000).toFixed(2)}M tok`;
}
