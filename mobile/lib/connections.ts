import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { AppState, type AppStateStatus } from 'react-native';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import {
  ProtocolClient,
  parsePairing,
  type HostInfo,
  type HostPairing,
  type SocketOptions,
} from './protocol/client';
import { decodePsk, relayToken } from './protocol/crypto';

export type HostStatus = 'idle' | 'connecting' | 'online' | 'reconnecting' | 'error';

export type EndpointKind = 'lan' | 'relay';

export interface HostMeta {
  hostId: string;
  name: string;
  endpoints: string[];
  secureKey: string;
  addedAt: number;
  lastConnectedAt: number | null;
  autoConnect: boolean;
}

export interface HostRuntime {
  status: HostStatus;
  endpoint: string | null;
  endpointKind: EndpointKind | null;
  latencyMs: number | null;
  lastError: string | null;
  attempt: number;
  drops: number;
  readySince: number | null;
  hostInfo: HostInfo | null;
  since: number;
  nextRetryAt: number | null;
}

export interface ResolvedEndpoint {
  raw: string;
  url: string;
  kind: EndpointKind;
  options?: SocketOptions;
}

const HOSTS_KEY = 'l8git.hosts.v1';
const ACTIVE_KEY = 'l8git.activeHost.v1';
const SECURE_PREFIX = 'l8git_pairing_';
const RELAY_HEADSTART_MS = 1_200;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_CAP_MS = 30_000;
const STABLE_CONNECTION_MS = 30_000;
const RELAY_TOKEN_HEADER = 'x-relay-token';

const ENDPOINT_PATTERN = /^(wss?):\/\/([^/?#]+)(\/[^?#]*)?$/i;
const IPV4_PATTERN = /^\d{1,3}(\.\d{1,3}){3}$/;

const clients = new Map<string, ProtocolClient>();
const pairings = new Map<string, HostPairing>();
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const attemptTokens = new Map<string, number>();
const clientUnsubscribes = new Map<string, () => void>();
const inflightConnects = new Map<string, Promise<void>>();

export const IDLE_RUNTIME: HostRuntime = Object.freeze({
  status: 'idle',
  endpoint: null,
  endpointKind: null,
  latencyMs: null,
  lastError: null,
  attempt: 0,
  drops: 0,
  readySince: null,
  hostInfo: null,
  since: 0,
  nextRetryAt: null,
});

export function idleRuntime(): HostRuntime {
  return { ...IDLE_RUNTIME, since: Date.now() };
}

export function secureKeyFor(hostId: string): string {
  return `${SECURE_PREFIX}${hostId.replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

export function classifyEndpoint(endpoint: string): EndpointKind {
  const match = ENDPOINT_PATTERN.exec(endpoint.trim());
  if (!match) {
    return 'relay';
  }
  const [, scheme, authority, path] = match;
  if (scheme.toLowerCase() !== 'ws') {
    return 'relay';
  }
  if (path && path !== '/' && path !== '/ws') {
    return 'relay';
  }
  const host = authority.replace(/^\[/, '').replace(/\](:\d+)?$/, '').replace(/:\d+$/, '');
  if (host === 'localhost' || IPV4_PATTERN.test(host) || host.includes(':')) {
    return 'lan';
  }
  return 'relay';
}

export function resolveEndpoint(endpoint: string, pairing: HostPairing): ResolvedEndpoint {
  const raw = endpoint.trim();
  const kind = classifyEndpoint(raw);
  if (kind === 'lan') {
    return { raw, url: raw, kind };
  }
  const base = raw.replace(/\/+$/, '');
  const url = base.includes('/client/') ? base : `${base}/client/${pairing.hostId}`;
  return {
    raw,
    url,
    kind,
    options: { headers: { [RELAY_TOKEN_HEADER]: relayToken(decodePsk(pairing.psk)) } },
  };
}

export function backoffDelay(attempt: number): number {
  const exponent = Math.max(0, attempt - 1);
  const base = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** Math.min(exponent, 10));
  return Math.round(base / 2 + Math.random() * (base / 2));
}

export interface RetryPlan {
  attempt: number;
  drops: number;
  delay: number;
}

export function planRetry(
  runtime: Pick<HostRuntime, 'attempt' | 'drops' | 'readySince'> | undefined,
  now = Date.now()
): RetryPlan {
  const attempt = (runtime?.attempt ?? 0) + 1;
  const stable =
    runtime?.readySince != null && now - runtime.readySince >= STABLE_CONNECTION_MS;
  const drops = stable ? 1 : (runtime?.drops ?? 0) + 1;
  return { attempt, drops, delay: backoffDelay(Math.max(attempt, drops)) };
}

interface ConnectionsState {
  hydrated: boolean;
  hosts: HostMeta[];
  runtime: Record<string, HostRuntime>;
  activeHostId: string | null;
  clientEpoch: number;
  hydrate: () => Promise<void>;
  addHost: (payload: string | HostPairing) => Promise<HostMeta>;
  forgetHost: (hostId: string) => Promise<void>;
  renameHost: (hostId: string, name: string) => Promise<void>;
  setAutoConnect: (hostId: string, autoConnect: boolean) => Promise<void>;
  setActiveHost: (hostId: string | null) => void;
  connect: (hostId: string) => Promise<void>;
  disconnect: (hostId: string) => void;
  connectAll: () => void;
  disconnectAll: () => void;
  measureLatency: (hostId: string) => Promise<number | null>;
}

export const useConnections = create<ConnectionsState>((set, get) => {
  const patch = (hostId: string, next: Partial<HostRuntime>) => {
    set((state) => ({
      runtime: {
        ...state.runtime,
        [hostId]: { ...(state.runtime[hostId] ?? idleRuntime()), ...next, since: Date.now() },
      },
    }));
  };

  const persistHosts = async (hosts: HostMeta[]) => {
    await AsyncStorage.setItem(HOSTS_KEY, JSON.stringify(hosts));
  };

  const updateHost = async (hostId: string, next: Partial<HostMeta>) => {
    const hosts = get().hosts.map((host) => (host.hostId === hostId ? { ...host, ...next } : host));
    set({ hosts });
    await persistHosts(hosts);
  };

  const scheduleRetry = (hostId: string) => {
    const meta = get().hosts.find((host) => host.hostId === hostId);
    if (!meta?.autoConnect) {
      return;
    }
    clearRetry(hostId);
    const { attempt, drops, delay } = planRetry(get().runtime[hostId]);
    patch(hostId, {
      status: 'reconnecting',
      attempt,
      drops,
      readySince: null,
      nextRetryAt: Date.now() + delay,
    });
    retryTimers.set(
      hostId,
      setTimeout(() => {
        retryTimers.delete(hostId);
        void get().connect(hostId);
      }, delay)
    );
  };

  const installClient = (hostId: string, client: ProtocolClient) => {
    releaseClient(hostId);
    clients.set(hostId, client);
    set((state) => ({ clientEpoch: state.clientEpoch + 1 }));
    const off = client.onStatus((status, error) => {
      if (status === 'ready') {
        patch(hostId, {
          status: 'online',
          lastError: null,
          attempt: 0,
          readySince: Date.now(),
          nextRetryAt: null,
          latencyMs: client.latencyMs,
          hostInfo: client.hostInfo,
          endpoint: client.endpoint,
        });
        return;
      }
      if (status === 'closed' || status === 'error') {
        if (clients.get(hostId) !== client) {
          return;
        }
        releaseClient(hostId);
        set((state) => ({ clientEpoch: state.clientEpoch + 1 }));
        patch(hostId, {
          status: status === 'error' ? 'error' : 'idle',
          lastError: error ?? null,
          latencyMs: null,
        });
        scheduleRetry(hostId);
      }
    });
    clientUnsubscribes.set(hostId, off);
  };

  return {
    hydrated: false,
    hosts: [],
    runtime: {},
    activeHostId: null,
    clientEpoch: 0,

    hydrate: async () => {
      if (get().hydrated) {
        return;
      }
      const [rawHosts, rawActive] = await Promise.all([
        AsyncStorage.getItem(HOSTS_KEY),
        AsyncStorage.getItem(ACTIVE_KEY),
      ]);
      const hosts = parseHostList(rawHosts);
      const runtime: Record<string, HostRuntime> = {};
      for (const host of hosts) {
        runtime[host.hostId] = idleRuntime();
      }
      const activeHostId =
        rawActive && hosts.some((host) => host.hostId === rawActive)
          ? rawActive
          : (hosts[0]?.hostId ?? null);
      set({ hosts, runtime, activeHostId, hydrated: true });
      get().connectAll();
    },

    addHost: async (payload) => {
      const pairing = typeof payload === 'string' ? parsePairing(payload) : payload;
      decodePsk(pairing.psk);
      const secureKey = secureKeyFor(pairing.hostId);
      await SecureStore.setItemAsync(secureKey, JSON.stringify(pairing));
      pairings.set(pairing.hostId, pairing);

      const existing = get().hosts.find((host) => host.hostId === pairing.hostId);
      const meta: HostMeta = {
        hostId: pairing.hostId,
        name: pairing.name ?? existing?.name ?? pairing.hostId,
        endpoints: pairing.endpoints,
        secureKey,
        addedAt: existing?.addedAt ?? Date.now(),
        lastConnectedAt: existing?.lastConnectedAt ?? null,
        autoConnect: true,
      };
      const hosts = existing
        ? get().hosts.map((host) => (host.hostId === meta.hostId ? meta : host))
        : [...get().hosts, meta];
      set((state) => ({
        hosts,
        runtime: { ...state.runtime, [meta.hostId]: idleRuntime() },
        activeHostId: state.activeHostId ?? meta.hostId,
      }));
      await persistHosts(hosts);
      await AsyncStorage.setItem(ACTIVE_KEY, get().activeHostId ?? meta.hostId);
      return meta;
    },

    forgetHost: async (hostId) => {
      get().disconnect(hostId);
      const meta = get().hosts.find((host) => host.hostId === hostId);
      if (meta) {
        await SecureStore.deleteItemAsync(meta.secureKey).catch(() => undefined);
      }
      pairings.delete(hostId);
      const hosts = get().hosts.filter((host) => host.hostId !== hostId);
      const runtime = { ...get().runtime };
      delete runtime[hostId];
      const activeHostId =
        get().activeHostId === hostId ? (hosts[0]?.hostId ?? null) : get().activeHostId;
      set({ hosts, runtime, activeHostId });
      await persistHosts(hosts);
      if (activeHostId) {
        await AsyncStorage.setItem(ACTIVE_KEY, activeHostId);
      } else {
        await AsyncStorage.removeItem(ACTIVE_KEY);
      }
    },

    renameHost: async (hostId, name) => {
      await updateHost(hostId, { name });
    },

    setAutoConnect: async (hostId, autoConnect) => {
      await updateHost(hostId, { autoConnect });
      if (!autoConnect) {
        clearRetry(hostId);
      }
    },

    setActiveHost: (hostId) => {
      set({ activeHostId: hostId });
      void (hostId ? AsyncStorage.setItem(ACTIVE_KEY, hostId) : AsyncStorage.removeItem(ACTIVE_KEY));
    },

    connect: async (hostId) => {
      const meta = get().hosts.find((host) => host.hostId === hostId);
      if (!meta) {
        throw new Error(`unknown host ${hostId}`);
      }
      if (clients.get(hostId)?.isReady) {
        return;
      }
      const pending = inflightConnects.get(hostId);
      if (pending) {
        return pending;
      }
      clearRetry(hostId);

      const token = (attemptTokens.get(hostId) ?? 0) + 1;
      attemptTokens.set(hostId, token);
      patch(hostId, { status: 'connecting', lastError: null, nextRetryAt: null });

      const run = (async () => {
        try {
          const pairing = await loadPairing(meta);
          const winner = await raceEndpoints(
            meta,
            pairing,
            () => attemptTokens.get(hostId) === token
          );
          if (attemptTokens.get(hostId) !== token) {
            winner.close();
            return;
          }
          installClient(hostId, winner);
          patch(hostId, {
            status: 'online',
            endpoint: winner.endpoint,
            endpointKind: winner.endpoint ? classifyEndpoint(winner.endpoint) : null,
            hostInfo: winner.hostInfo,
            lastError: null,
            attempt: 0,
            readySince: Date.now(),
            nextRetryAt: null,
          });
          await updateHost(hostId, { lastConnectedAt: Date.now() });
        } catch (cause) {
          if (attemptTokens.get(hostId) !== token) {
            return;
          }
          patch(hostId, {
            status: 'error',
            lastError: cause instanceof Error ? cause.message : String(cause),
          });
          scheduleRetry(hostId);
        }
      })();
      inflightConnects.set(hostId, run);
      try {
        await run;
      } finally {
        if (inflightConnects.get(hostId) === run) {
          inflightConnects.delete(hostId);
        }
      }
    },

    disconnect: (hostId) => {
      attemptTokens.set(hostId, (attemptTokens.get(hostId) ?? 0) + 1);
      inflightConnects.delete(hostId);
      clearRetry(hostId);
      const client = clients.get(hostId);
      releaseClient(hostId);
      client?.close();
      set((state) => ({ clientEpoch: state.clientEpoch + 1 }));
      patch(hostId, {
        status: 'idle',
        endpoint: null,
        endpointKind: null,
        latencyMs: null,
        attempt: 0,
        drops: 0,
        readySince: null,
        nextRetryAt: null,
      });
    },

    connectAll: () => {
      for (const host of get().hosts) {
        if (host.autoConnect && !clients.get(host.hostId)?.isReady) {
          void get().connect(host.hostId);
        }
      }
    },

    disconnectAll: () => {
      for (const host of get().hosts) {
        get().disconnect(host.hostId);
      }
    },

    measureLatency: async (hostId) => {
      const client = clients.get(hostId);
      if (!client?.isReady) {
        return null;
      }
      try {
        const rtt = await client.ping();
        patch(hostId, { latencyMs: rtt });
        return rtt;
      } catch {
        return null;
      }
    },
  };
});

function clearRetry(hostId: string): void {
  const timer = retryTimers.get(hostId);
  if (timer) {
    clearTimeout(timer);
    retryTimers.delete(hostId);
  }
}

function releaseClient(hostId: string): void {
  clientUnsubscribes.get(hostId)?.();
  clientUnsubscribes.delete(hostId);
  clients.delete(hostId);
}

function parseHostList(raw: string | null): HostMeta[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is HostMeta => {
      const host = item as Partial<HostMeta>;
      return typeof host?.hostId === 'string' && Array.isArray(host.endpoints);
    });
  } catch {
    return [];
  }
}

async function loadPairing(meta: HostMeta): Promise<HostPairing> {
  const cached = pairings.get(meta.hostId);
  if (cached) {
    return cached;
  }
  const raw = await SecureStore.getItemAsync(meta.secureKey);
  if (!raw) {
    throw new Error('pairing secret is missing: pair this host again');
  }
  const pairing = parsePairing(raw);
  pairings.set(meta.hostId, pairing);
  return pairing;
}

async function raceEndpoints(
  meta: HostMeta,
  pairing: HostPairing,
  stillWanted: () => boolean
): Promise<ProtocolClient> {
  const endpoints = meta.endpoints.length > 0 ? meta.endpoints : pairing.endpoints;
  const candidates = endpoints.map((endpoint) => resolveEndpoint(endpoint, pairing));
  if (candidates.length === 0) {
    throw new Error('host has no endpoints');
  }
  const hasLan = candidates.some((candidate) => candidate.kind === 'lan');
  const attempts = candidates.map((candidate) => ({
    candidate,
    delay: candidate.kind === 'relay' && hasLan ? RELAY_HEADSTART_MS : 0,
    client: new ProtocolClient(),
  }));

  return new Promise<ProtocolClient>((resolve, reject) => {
    let decided = false;
    let remaining = attempts.length;
    const failures: string[] = [];

    const closeLosers = (keep: ProtocolClient) => {
      for (const other of attempts) {
        if (other.client !== keep) {
          other.client.close();
        }
      }
    };

    for (const { candidate, delay, client } of attempts) {
      void (async () => {
        if (delay > 0) {
          await sleep(delay);
        }
        if (decided || !stillWanted()) {
          return;
        }
        await client.connect(candidate.url, pairing, candidate.options);
        if (decided || !stillWanted()) {
          client.close();
          return;
        }
        decided = true;
        closeLosers(client);
        resolve(client);
      })().catch((cause: unknown) => {
        failures.push(
          `${candidate.raw}: ${cause instanceof Error ? cause.message : String(cause)}`
        );
      }).finally(() => {
        remaining -= 1;
        if (remaining === 0 && !decided) {
          reject(new Error(failures.length > 0 ? failures.join('; ') : 'no endpoint reachable'));
        }
      });
    }
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getClient(hostId: string | null | undefined): ProtocolClient | null {
  if (!hostId) {
    return null;
  }
  const client = clients.get(hostId);
  return client?.isReady ? client : null;
}

export function getActiveClient(): ProtocolClient | null {
  return getClient(useConnections.getState().activeHostId);
}

export function requireActiveClient(): ProtocolClient {
  const client = getActiveClient();
  if (!client) {
    throw new Error('no l8git host is connected');
  }
  return client;
}

export function requireClient(hostId: string): ProtocolClient {
  const client = getClient(hostId);
  if (!client) {
    throw new Error(`host ${hostId} is not connected`);
  }
  return client;
}

export function subscribeHostEvent(
  hostId: string,
  event: string,
  listener: (payload: unknown) => void
): () => void {
  let off: (() => void) | null = getClient(hostId)?.on(event, listener) ?? null;
  const unsubscribe = useConnections.subscribe((state, previous) => {
    if (state.clientEpoch === previous.clientEpoch) {
      return;
    }
    off?.();
    off = getClient(hostId)?.on(event, listener) ?? null;
  });
  return () => {
    unsubscribe();
    off?.();
  };
}

export function startConnectionManager(): () => void {
  void useConnections.getState().hydrate();
  const onChange = (next: AppStateStatus) => {
    if (next !== 'active') {
      return;
    }
    const { hosts, connect } = useConnections.getState();
    for (const host of hosts) {
      if (!host.autoConnect || clients.get(host.hostId)?.isReady) {
        continue;
      }
      clearRetry(host.hostId);
      void connect(host.hostId);
    }
  };
  const subscription = AppState.addEventListener('change', onChange);
  return () => {
    subscription.remove();
  };
}

export function useHostRuntime(hostId: string | null | undefined): HostRuntime {
  return useConnections((state) =>
    hostId ? (state.runtime[hostId] ?? IDLE_RUNTIME) : IDLE_RUNTIME
  );
}

export function useHostMeta(hostId: string | null | undefined): HostMeta | null {
  return useConnections((state) => state.hosts.find((host) => host.hostId === hostId) ?? null);
}

export function useActiveHostId(): string | null {
  return useConnections((state) => state.activeHostId);
}

export function useOnlineHostIds(): string[] {
  return useConnections(
    useShallow((state) =>
      state.hosts
        .filter((host) => state.runtime[host.hostId]?.status === 'online')
        .map((host) => host.hostId)
    )
  );
}
