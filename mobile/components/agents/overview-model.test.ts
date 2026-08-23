import { describe, expect, it } from 'vitest';

import type { HostAgentEntry } from '~/lib/agents/overview-aggregator';

import {
  DEFAULT_AGENT_FILTERS,
  agentTimestampMs,
  applyAgentFilters,
  attentionEntries,
  countByHost,
  countByProvider,
  countByStatus,
  formatTokens,
  groupEntriesByRepo,
  isDefaultFilters,
  pendingApprovals,
  totalCostUsd,
  totalTokens,
} from './overview-model';

function entry(overrides: Partial<HostAgentEntry> = {}): HostAgentEntry {
  return {
    key: 'mac:codex:t1',
    provider: 'codex',
    threadId: 't1',
    path: '/repos/app',
    repoName: 'app',
    basePath: '/repos/app',
    branch: null,
    isWorktree: false,
    title: 'Refactor router',
    preview: 'looking at the router',
    updatedAt: 1_700_000_000,
    status: 'idle',
    pendingRequests: 0,
    costUsd: null,
    tokens: 0,
    hostId: 'mac',
    hostName: 'mac',
    stale: false,
    ...overrides,
  };
}

describe('applyAgentFilters', () => {
  const entries = [
    entry({ key: 'a', status: 'running' }),
    entry({ key: 'b', status: 'awaitingApproval', provider: 'claude' }),
    entry({ key: 'c', status: 'idle', hostId: 'linux', hostName: 'linux' }),
  ];

  it('keeps everything by default', () => {
    expect(applyAgentFilters(entries, DEFAULT_AGENT_FILTERS)).toHaveLength(3);
    expect(isDefaultFilters(DEFAULT_AGENT_FILTERS)).toBe(true);
  });

  it('filters by status, provider and host together', () => {
    expect(
      applyAgentFilters(entries, { ...DEFAULT_AGENT_FILTERS, status: 'running' }).map((e) => e.key)
    ).toEqual(['a']);
    expect(
      applyAgentFilters(entries, { ...DEFAULT_AGENT_FILTERS, provider: 'claude' }).map((e) => e.key)
    ).toEqual(['b']);
    expect(
      applyAgentFilters(entries, { ...DEFAULT_AGENT_FILTERS, hostId: 'linux' }).map((e) => e.key)
    ).toEqual(['c']);
    expect(
      applyAgentFilters(entries, { status: 'running', provider: 'claude', hostId: 'mac' })
    ).toEqual([]);
  });
});

describe('counts', () => {
  const entries = [
    entry({ key: 'a', status: 'running', pendingRequests: 0 }),
    entry({ key: 'b', status: 'awaitingApproval', pendingRequests: 2, provider: 'claude' }),
    entry({ key: 'c', status: 'failed', hostId: 'linux', hostName: 'linux' }),
    entry({ key: 'd', status: 'idle', costUsd: 0.25, tokens: 1500 }),
  ];

  it('aggregates status, provider, host and totals', () => {
    expect(countByStatus(entries)).toEqual({
      running: 1,
      awaitingApproval: 1,
      failed: 1,
      idle: 1,
      active: 2,
    });
    expect(countByProvider(entries)).toEqual({ codex: 3, claude: 1, cursor: 0, opencode: 0 });
    expect(countByHost(entries)).toEqual({ mac: 3, linux: 1 });
    expect(pendingApprovals(entries)).toBe(2);
    expect(totalCostUsd(entries)).toBeCloseTo(0.25);
    expect(totalTokens(entries)).toBe(1500);
  });

  it('collects approvals and failures for the attention section', () => {
    expect(attentionEntries(entries).map((item) => item.key)).toEqual(['b', 'c']);
  });
});

describe('groupEntriesByRepo', () => {
  it('groups per host and repo and puts approvals first', () => {
    const groups = groupEntriesByRepo([
      entry({ key: 'a', path: '/repos/app', status: 'idle', updatedAt: 10 }),
      entry({ key: 'b', path: '/repos/app', status: 'awaitingApproval', updatedAt: 5 }),
      entry({
        key: 'c',
        path: '/repos/app',
        hostId: 'linux',
        hostName: 'linux',
        repoName: 'app',
        status: 'idle',
        updatedAt: 99,
      }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].key).toBe('mac:/repos/app');
    expect(groups[0].entries.map((item) => item.key)).toEqual(['b', 'a']);
    expect(groups[0].counts.awaitingApproval).toBe(1);
    expect(groups[0].updatedAt).toBe(10);
    expect(groups[1].key).toBe('linux:/repos/app');
  });
});

describe('formatting', () => {
  it('normalises second and millisecond timestamps', () => {
    expect(agentTimestampMs(0)).toBe(0);
    expect(agentTimestampMs(1_700_000_000)).toBe(1_700_000_000_000);
    expect(agentTimestampMs(1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  it('formats token counts', () => {
    expect(formatTokens(0)).toBeNull();
    expect(formatTokens(940)).toBe('940 tok');
    expect(formatTokens(12_400)).toBe('12.4k tok');
    expect(formatTokens(240_000)).toBe('240k tok');
    expect(formatTokens(3_500_000)).toBe('3.50M tok');
  });
});
