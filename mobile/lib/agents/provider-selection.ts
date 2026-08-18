import AsyncStorage from '@react-native-async-storage/async-storage';
import { create, useStore, type StoreApi } from 'zustand';

import { AGENT_PROVIDER_KEY } from '@desktop/lib/agents/storage-keys';
import { kvGet } from '@desktop/lib/platform/kv';

import {
  AGENT_PROVIDERS,
  tryAgentStores,
  type AgentProviderStoreState,
  type NativeAgentProvider,
} from './stores';

const STORAGE_KEY = 'l8git.agents.provider-by-host.v1';

export const DEFAULT_AGENT_PROVIDER: NativeAgentProvider = 'codex';

export function isAgentProvider(value: unknown): value is NativeAgentProvider {
  return typeof value === 'string' && AGENT_PROVIDERS.includes(value as NativeAgentProvider);
}

function parse(raw: string | null): Record<string, NativeAgentProvider> {
  if (!raw) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, NativeAgentProvider> = {};
    for (const [hostId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isAgentProvider(value)) {
        out[hostId] = value;
      }
    }
    return out;
  } catch {
    return {};
  }
}

interface ProviderSelectionState {
  hydrated: boolean;
  byHost: Record<string, NativeAgentProvider>;
  hydrate: () => Promise<void>;
  remember: (hostId: string, provider: NativeAgentProvider) => void;
}

export const useProviderSelection = create<ProviderSelectionState>((set, get) => ({
  hydrated: false,
  byHost: {},

  hydrate: async () => {
    if (get().hydrated) {
      return;
    }
    const raw = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
    set({ byHost: parse(raw), hydrated: true });
  },

  remember: (hostId, provider) => {
    if (get().byHost[hostId] === provider) {
      return;
    }
    const byHost = { ...get().byHost, [hostId]: provider };
    set({ byHost });
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(byHost)).catch(() => undefined);
  },
}));

export function persistedGlobalProvider(): NativeAgentProvider {
  const stored = kvGet(AGENT_PROVIDER_KEY);
  return isAgentProvider(stored) ? stored : DEFAULT_AGENT_PROVIDER;
}

export function activeProvider(): NativeAgentProvider {
  return tryAgentStores()?.providerStore.getState().provider ?? DEFAULT_AGENT_PROVIDER;
}

export function selectProvider(provider: NativeAgentProvider, hostId?: string | null): void {
  tryAgentStores()?.providerStore.getState().setProvider(provider);
  if (hostId) {
    useProviderSelection.getState().remember(hostId, provider);
  }
}

export function providerForHost(hostId: string | null): NativeAgentProvider {
  if (!hostId) {
    return persistedGlobalProvider();
  }
  return useProviderSelection.getState().byHost[hostId] ?? persistedGlobalProvider();
}

export function applyProviderForHost(hostId: string | null): NativeAgentProvider {
  const provider = providerForHost(hostId);
  const stores = tryAgentStores();
  if (stores && stores.providerStore.getState().provider !== provider) {
    stores.providerStore.getState().setProvider(provider);
  }
  return provider;
}

const inertProviderStore: StoreApi<AgentProviderStoreState | null> = {
  getState: () => null,
  getInitialState: () => null,
  setState: () => undefined,
  subscribe: () => () => undefined,
};

export function useActiveProvider(): NativeAgentProvider {
  const store =
    (tryAgentStores()?.providerStore as StoreApi<AgentProviderStoreState | null> | undefined) ??
    inertProviderStore;
  return useStore(store, (state) => state?.provider ?? DEFAULT_AGENT_PROVIDER);
}
