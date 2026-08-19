import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}));

vi.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));

interface FakeClient {
  hostId: string;
  requests: Array<{ cmd: string; args: Record<string, unknown> }>;
  events: Map<string, Set<(payload: unknown) => void>>;
  request: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  on: (event: string, listener: (payload: unknown) => void) => () => void;
  emit: (event: string, payload: unknown) => void;
}

const harness = vi.hoisted(() => {
  const clients = new Map<string, unknown>();
  let activeHostId: string | null = null;
  let clientEpoch = 0;
  const subscribers = new Set<() => void>();
  const connections = {
    getState: () => ({ activeHostId, clientEpoch }),
    setState: (next: { activeHostId?: string | null; clientEpoch?: number }) => {
      if ('activeHostId' in next) activeHostId = next.activeHostId ?? null;
      if (typeof next.clientEpoch === 'number') clientEpoch = next.clientEpoch;
      for (const listener of [...subscribers]) listener();
    },
    subscribe: (listener: () => void) => {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
  };
  return { clients, connections };
});

vi.mock('./connections', () => ({
  useConnections: harness.connections,
  getClient: (hostId: string | null | undefined) =>
    hostId ? (harness.clients.get(hostId) ?? null) : null,
  requireClient: (hostId: string) => {
    const client = harness.clients.get(hostId);
    if (!client) throw new Error(`host ${hostId} is not connected`);
    return client;
  },
  requireActiveClient: () => {
    const client = harness.clients.get(harness.connections.getState().activeHostId ?? '');
    if (!client) throw new Error('no l8git host is connected');
    return client;
  },
}));

import { useAgentBinding } from './agents/binding';
import { remotePlatform } from './platform-remote';

function fakeClient(hostId: string): FakeClient {
  const client: FakeClient = {
    hostId,
    requests: [],
    events: new Map(),
    request: async (cmd, args = {}) => {
      client.requests.push({ cmd, args });
      return hostId;
    },
    on: (event, listener) => {
      const set = client.events.get(event) ?? new Set();
      set.add(listener);
      client.events.set(event, set);
      return () => set.delete(listener);
    },
    emit: (event, payload) => {
      for (const listener of client.events.get(event) ?? []) listener(payload);
    },
  };
  harness.clients.set(hostId, client);
  return client;
}

beforeEach(() => {
  harness.clients.clear();
  harness.connections.setState({ activeHostId: null, clientEpoch: 0 });
  useAgentBinding.setState({ hostId: null, epoch: 0 });
});

describe('remotePlatform.invoke', () => {
  it('targets the agent-bound host even when the connections UI made another host active', async () => {
    const hostA = fakeClient('host-a');
    const hostB = fakeClient('host-b');
    useAgentBinding.setState({ hostId: 'host-a' });
    harness.connections.setState({ activeHostId: 'host-b' });

    await remotePlatform.invoke('agent_transport_open', { provider: 'codex' });

    expect(hostA.requests).toHaveLength(1);
    expect(hostB.requests).toHaveLength(0);
  });

  it('falls back to the active host while nothing is bound', async () => {
    const hostB = fakeClient('host-b');
    harness.connections.setState({ activeHostId: 'host-b' });

    await remotePlatform.invoke('repo_status', { repoPath: '/tmp' });

    expect(hostB.requests).toHaveLength(1);
  });

  it('rejects instead of throwing synchronously when the bound host is gone', async () => {
    useAgentBinding.setState({ hostId: 'host-a' });
    let promise: Promise<unknown> = Promise.resolve();
    expect(() => {
      promise = remotePlatform.invoke('agent_transport_close', { id: 1 });
    }).not.toThrow();
    await expect(promise).rejects.toThrow(/host-a is not connected/u);
  });

  it('rejects instead of throwing synchronously when no host is connected at all', async () => {
    let promise: Promise<unknown> = Promise.resolve();
    expect(() => {
      promise = remotePlatform.invoke('repo_status', {});
    }).not.toThrow();
    await expect(promise).rejects.toThrow(/no l8git host is connected/u);
  });
});

describe('remotePlatform.listen', () => {
  it('follows the agent binding rather than the active host', () => {
    const hostA = fakeClient('host-a');
    const hostB = fakeClient('host-b');
    useAgentBinding.setState({ hostId: 'host-a' });
    harness.connections.setState({ activeHostId: 'host-a' });

    const seen: unknown[] = [];
    const off = remotePlatform.listen('agent-stream', (payload) => seen.push(payload));

    harness.connections.setState({ activeHostId: 'host-b' });
    hostA.emit('agent-stream', 'from-a');
    hostB.emit('agent-stream', 'from-b');

    expect(seen).toEqual(['from-a']);
    off();
  });

  it('rebinds when the agent binding moves to another host', () => {
    const hostA = fakeClient('host-a');
    const hostB = fakeClient('host-b');
    useAgentBinding.setState({ hostId: 'host-a' });

    const seen: unknown[] = [];
    const off = remotePlatform.listen('agent-stream', (payload) => seen.push(payload));
    useAgentBinding.setState({ hostId: 'host-b' });

    hostA.emit('agent-stream', 'from-a');
    hostB.emit('agent-stream', 'from-b');

    expect(seen).toEqual(['from-b']);
    off();
  });
});
