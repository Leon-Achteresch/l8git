import { describe, expect, it } from 'vitest';

import type { AgentConversation, AgentThreadSummary } from '@desktop/lib/agents/types';

import {
  aggregateAgentOverview,
  emptyHostSnapshot,
  hostEntries,
  type AgentHostSnapshot,
} from './overview-aggregator';

function thread(id: string, path: string, updatedAt: number): AgentThreadSummary {
  return {
    id,
    path,
    title: `thread ${id}`,
    preview: `preview ${id}`,
    createdAt: updatedAt - 1_000,
    updatedAt,
    status: 'idle',
    modelProvider: 'openai',
    isPinned: false,
    archived: false,
  };
}

function conversation(overrides: Partial<AgentConversation> = {}): AgentConversation {
  return {
    threadId: 'thread',
    path: '/repo',
    title: 'thread',
    turns: [],
    activeTurnId: null,
    error: null,
    ...overrides,
  } as AgentConversation;
}

function snapshot(overrides: Partial<AgentHostSnapshot> = {}): AgentHostSnapshot {
  return {
    ...emptyHostSnapshot('host-a', 'Studio', true),
    bound: true,
    capturedAt: 1_000,
    providers: {
      codex: {
        threadsByPath: { '/repo': [thread('t1', '/repo', 20)] },
        conversations: {},
        requestsByThread: {},
      },
    },
    ...overrides,
  };
}

describe('hostEntries', () => {
  it('namespaces entry keys by host and stamps host identity', () => {
    const entries = hostEntries(snapshot());
    expect(entries).toHaveLength(1);
    expect(entries[0].key).toBe('host-a:codex:t1');
    expect(entries[0].hostId).toBe('host-a');
    expect(entries[0].hostName).toBe('Studio');
    expect(entries[0].stale).toBe(false);
  });

  it('demotes running turns and pending approvals of unbound hosts', () => {
    const entries = hostEntries(
      snapshot({
        bound: false,
        providers: {
          codex: {
            threadsByPath: { '/repo': [thread('t1', '/repo', 20)] },
            conversations: { t1: conversation({ activeTurnId: 'turn-1' }) },
            requestsByThread: { t1: [{ id: 'r1' }] as never },
          },
        },
      })
    );
    expect(entries[0].stale).toBe(true);
    expect(entries[0].status).toBe('idle');
    expect(entries[0].pendingRequests).toBe(0);
  });

  it('restricts entries to the known repo paths of the host', () => {
    const entries = hostEntries(
      snapshot({
        knownPaths: ['/other'],
        providers: {
          codex: {
            threadsByPath: {
              '/repo': [thread('t1', '/repo', 20)],
              '/other': [thread('t2', '/other', 10)],
            },
            conversations: {},
            requestsByThread: {},
          },
        },
      })
    );
    expect(entries.map((entry) => entry.threadId)).toEqual(['t2']);
  });

  it('collects every provider present in the snapshot', () => {
    const entries = hostEntries(
      snapshot({
        providers: {
          codex: {
            threadsByPath: { '/repo': [thread('t1', '/repo', 20)] },
            conversations: {},
            requestsByThread: {},
          },
          claude: {
            threadsByPath: { '/repo': [thread('t2', '/repo', 30)] },
            conversations: {},
            requestsByThread: {},
          },
        },
      })
    );
    expect(entries.map((entry) => entry.provider).sort()).toEqual(['claude', 'codex']);
  });
});

describe('aggregateAgentOverview', () => {
  const busy = snapshot({
    hostId: 'host-a',
    hostName: 'Studio',
    providers: {
      codex: {
        threadsByPath: { '/repo': [thread('t1', '/repo', 20), thread('t2', '/repo', 50)] },
        conversations: { t2: conversation({ activeTurnId: 'turn-2' }) },
        requestsByThread: { t1: [{ id: 'r1' }] as never },
      },
    },
  });

  const laptop = snapshot({
    hostId: 'host-b',
    hostName: 'Laptop',
    online: true,
    bound: false,
    providers: {
      claude: {
        threadsByPath: { '/work': [thread('t3', '/work', 40)] },
        conversations: {},
        requestsByThread: {},
      },
    },
  });

  it('sorts approvals first, then running, then by recency', () => {
    const summary = aggregateAgentOverview([busy, laptop]);
    expect(summary.entries.map((entry) => entry.threadId)).toEqual(['t1', 't2', 't3']);
  });

  it('counts across every host', () => {
    const summary = aggregateAgentOverview([busy, laptop]);
    expect(summary.counts.awaitingApproval).toBe(1);
    expect(summary.counts.running).toBe(1);
    expect(summary.counts.idle).toBe(1);
    expect(summary.counts.active).toBe(2);
  });

  it('summarises each host separately and puts busy hosts first', () => {
    const summary = aggregateAgentOverview([laptop, busy]);
    expect(summary.hosts.map((host) => host.hostId)).toEqual(['host-a', 'host-b']);
    expect(summary.hosts[0].threads).toBe(2);
    expect(summary.hosts[0].counts.active).toBe(2);
    expect(summary.hosts[1].stale).toBe(true);
  });

  it('drops offline hosts when onlineOnly is set', () => {
    const offline = { ...laptop, online: false };
    const summary = aggregateAgentOverview([busy, offline], { onlineOnly: true });
    expect(summary.hosts.map((host) => host.hostId)).toEqual(['host-a']);
    expect(summary.entries.every((entry) => entry.hostId === 'host-a')).toBe(true);
  });

  it('filters entries by query without breaking host summaries', () => {
    const summary = aggregateAgentOverview([busy, laptop], { query: 'thread t3' });
    expect(summary.entries.map((entry) => entry.threadId)).toEqual(['t3']);
    expect(summary.hosts).toHaveLength(2);
    expect(summary.counts.idle).toBe(1);
  });

  it('returns an empty summary for hosts without agent activity', () => {
    const summary = aggregateAgentOverview([emptyHostSnapshot('host-c', 'Mini', true)]);
    expect(summary.entries).toEqual([]);
    expect(summary.counts.active).toBe(0);
    expect(summary.hosts[0].threads).toBe(0);
  });
});
