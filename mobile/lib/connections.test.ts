import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: () => ({ remove: () => undefined }),
  },
}));

const storage = new Map<string, string>();

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (name: string) => storage.get(name) ?? null,
    setItem: async (name: string, value: string) => {
      storage.set(name, value);
    },
    removeItem: async (name: string) => {
      storage.delete(name);
    },
  },
}));

const secureStore = new Map<string, string>();

vi.mock('expo-secure-store', () => ({
  getItemAsync: async (name: string) => secureStore.get(name) ?? null,
  setItemAsync: async (name: string, value: string) => {
    secureStore.set(name, value);
  },
  deleteItemAsync: async (name: string) => {
    secureStore.delete(name);
  },
}));

import {
  idleRuntime,
  planRetry,
  secureKeyFor,
  useConnections,
  type HostMeta,
  type HostRuntime,
} from './connections';

const HOST_ID = 'host-a';
const STABLE_MS = 30_000;

const pairing = {
  v: 1,
  hostId: HOST_ID,
  psk: Buffer.from(new Uint8Array(32).fill(7)).toString('base64'),
  name: 'zenbook',
  endpoints: ['ws://127.0.0.1:8484'],
};

const meta: HostMeta = {
  hostId: HOST_ID,
  name: 'zenbook',
  endpoints: pairing.endpoints,
  secureKey: secureKeyFor(HOST_ID),
  addedAt: 0,
  lastConnectedAt: null,
  autoConnect: true,
};

function runtime(overrides: Partial<HostRuntime>): HostRuntime {
  return { ...idleRuntime(), ...overrides };
}

describe('planRetry', () => {
  it('starts fast after a connection that stayed up long enough', () => {
    const now = 1_000_000;
    const plan = planRetry(
      runtime({ attempt: 0, drops: 4, readySince: now - STABLE_MS }),
      now
    );
    expect(plan.drops).toBe(1);
    expect(plan.delay).toBeLessThanOrEqual(1_000);
  });

  it('escalates across handshake-then-drop cycles even though attempt is reset', () => {
    const now = 1_000_000;
    const delays: number[] = [];
    let drops = 0;
    for (let cycle = 0; cycle < 6; cycle += 1) {
      const plan = planRetry(runtime({ attempt: 0, drops, readySince: now - 2_000 }), now);
      drops = plan.drops;
      delays.push(plan.delay);
    }
    expect(drops).toBe(6);
    expect(delays[0]).toBeLessThanOrEqual(1_000);
    expect(delays.at(-1)).toBeGreaterThan(10_000);
  });

  it('treats a never-ready host the same as before', () => {
    const plan = planRetry(runtime({ attempt: 3, drops: 0, readySince: null }), 1_000_000);
    expect(plan.attempt).toBe(4);
    expect(plan.delay).toBeGreaterThanOrEqual(4_000);
  });
});

describe('connect', () => {
  const sockets: FakeSocket[] = [];

  class FakeSocket {
    binaryType = '';
    onopen: ((event: unknown) => void) | null = null;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    onclose: ((event: unknown) => void) | null = null;
    closed = false;

    constructor(readonly url: string) {
      sockets.push(this);
    }

    send(): void {}

    close(): void {
      this.closed = true;
    }
  }

  beforeEach(() => {
    vi.useFakeTimers();
    sockets.length = 0;
    storage.clear();
    secureStore.clear();
    secureStore.set(secureKeyFor(HOST_ID), JSON.stringify(pairing));
    (globalThis as { WebSocket?: unknown }).WebSocket = FakeSocket;
    useConnections.setState({
      hydrated: true,
      hosts: [meta],
      runtime: { [HOST_ID]: idleRuntime() },
      activeHostId: HOST_ID,
      clientEpoch: 0,
    });
  });

  afterEach(() => {
    useConnections.getState().disconnect(HOST_ID);
    vi.useRealTimers();
    delete (globalThis as { WebSocket?: unknown }).WebSocket;
  });

  it('reuses the in-flight attempt instead of restarting the endpoint race', async () => {
    const first = useConnections.getState().connect(HOST_ID);
    await vi.advanceTimersByTimeAsync(0);
    expect(sockets).toHaveLength(1);

    const second = useConnections.getState().connect(HOST_ID);
    await vi.advanceTimersByTimeAsync(0);

    expect(sockets).toHaveLength(1);
    expect(sockets[0].closed).toBe(false);
    void first.catch(() => undefined);
    void second.catch(() => undefined);
  });

  it('starts a new attempt once the previous one was cancelled', async () => {
    void useConnections.getState().connect(HOST_ID).catch(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(sockets).toHaveLength(1);

    useConnections.getState().disconnect(HOST_ID);
    void useConnections.getState().connect(HOST_ID).catch(() => undefined);
    await vi.advanceTimersByTimeAsync(0);

    expect(sockets).toHaveLength(2);
  });
});
