import {
  buildProviderEntries,
  compareOverviewEntries,
  filterOverviewEntries,
  knownPathEntries,
  overviewCounts,
  type AgentOverviewCounts,
  type AgentOverviewEntry,
  type ProviderOverviewInput,
  type ThreadCost,
} from '@desktop/lib/agents/overview';
import type { AgentWorktree } from '@desktop/lib/agents/agent-worktrees';
import type { NativeAgentProvider } from '@desktop/lib/agents/provider-store';

export interface AgentHostSnapshot {
  hostId: string;
  hostName: string;
  online: boolean;
  bound: boolean;
  capturedAt: number;
  providers: Partial<Record<NativeAgentProvider, ProviderOverviewInput>>;
  worktrees: Record<string, AgentWorktree>;
  ledger: Record<string, ThreadCost>;
  knownPaths: readonly string[];
}

export interface HostAgentEntry extends AgentOverviewEntry {
  hostId: string;
  hostName: string;
  stale: boolean;
}

export interface HostAgentSummary {
  hostId: string;
  hostName: string;
  online: boolean;
  bound: boolean;
  stale: boolean;
  capturedAt: number;
  threads: number;
  counts: AgentOverviewCounts;
}

export interface AgentOverviewSummary {
  entries: HostAgentEntry[];
  counts: AgentOverviewCounts;
  hosts: HostAgentSummary[];
}

export interface AggregateOptions {
  query?: string;
  onlineOnly?: boolean;
}

export function emptyHostSnapshot(
  hostId: string,
  hostName: string,
  online = false
): AgentHostSnapshot {
  return {
    hostId,
    hostName,
    online,
    bound: false,
    capturedAt: 0,
    providers: {},
    worktrees: {},
    ledger: {},
    knownPaths: [],
  };
}

export function hostEntries(snapshot: AgentHostSnapshot): HostAgentEntry[] {
  const stale = !snapshot.bound;
  const entries: HostAgentEntry[] = [];
  for (const [provider, input] of Object.entries(snapshot.providers)) {
    if (!input) {
      continue;
    }
    const built = buildProviderEntries(
      provider as NativeAgentProvider,
      input,
      snapshot.worktrees,
      snapshot.ledger
    );
    const scoped = knownPathEntries(built, [...snapshot.knownPaths]);
    for (const entry of scoped) {
      entries.push({
        ...entry,
        key: `${snapshot.hostId}:${entry.key}`,
        hostId: snapshot.hostId,
        hostName: snapshot.hostName,
        stale,
        status: stale && entry.status !== 'failed' ? 'idle' : entry.status,
        pendingRequests: stale ? 0 : entry.pendingRequests,
      });
    }
  }
  return entries;
}

export function aggregateAgentOverview(
  snapshots: readonly AgentHostSnapshot[],
  options: AggregateOptions = {}
): AgentOverviewSummary {
  const visible = options.onlineOnly
    ? snapshots.filter((snapshot) => snapshot.online)
    : [...snapshots];

  const hosts: HostAgentSummary[] = [];
  let entries: HostAgentEntry[] = [];

  for (const snapshot of visible) {
    const hostScoped = hostEntries(snapshot);
    hosts.push({
      hostId: snapshot.hostId,
      hostName: snapshot.hostName,
      online: snapshot.online,
      bound: snapshot.bound,
      stale: !snapshot.bound,
      capturedAt: snapshot.capturedAt,
      threads: hostScoped.length,
      counts: overviewCounts(hostScoped),
    });
    entries = entries.concat(hostScoped);
  }

  const filtered = options.query
    ? (filterOverviewEntries(entries, options.query) as HostAgentEntry[])
    : entries;

  return {
    entries: [...filtered].sort(
      (left, right) =>
        compareOverviewEntries(left, right) || left.hostName.localeCompare(right.hostName)
    ),
    counts: overviewCounts(filtered),
    hosts: hosts.sort(
      (left, right) =>
        Number(right.online) - Number(left.online) ||
        right.counts.active - left.counts.active ||
        left.hostName.localeCompare(right.hostName)
    ),
  };
}
