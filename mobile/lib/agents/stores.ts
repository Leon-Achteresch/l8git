import { useStore, type StoreApi } from 'zustand';

import type { AgentChatState } from '@desktop/lib/agents/chat-store';
import type { NativeAgentProvider } from '@desktop/lib/agents/provider-store';

import { muteAgentAttention } from './attention';

export type { AgentChatState, NativeAgentProvider };

export const AGENT_PROVIDERS: readonly NativeAgentProvider[] = [
  'codex',
  'claude',
  'cursor',
  'opencode',
];

export type AgentChatStore = StoreApi<AgentChatState>;

export interface AgentProviderStoreState {
  provider: NativeAgentProvider;
  setProvider: (provider: NativeAgentProvider) => void;
}

export interface AgentStoreBundle {
  chatStoreFor: (provider: NativeAgentProvider) => AgentChatStore;
  providerStore: StoreApi<AgentProviderStoreState>;
  armTurnAttention: () => () => void;
}

let bundle: AgentStoreBundle | null = null;
let loading: Promise<AgentStoreBundle> | null = null;

export async function loadAgentStores(): Promise<AgentStoreBundle> {
  if (bundle) {
    return bundle;
  }
  if (loading) {
    return loading;
  }
  loading = (async () => {
    const [activeChat, provider, attention] = await Promise.all([
      import('@desktop/lib/agents/active-chat-store'),
      import('@desktop/lib/agents/provider-store'),
      import('@desktop/lib/agents/turn-attention'),
    ]);
    bundle = {
      chatStoreFor: (value) => activeChat.chatStoreFor(value) as AgentChatStore,
      providerStore: provider.useAgentProviderStore,
      armTurnAttention: attention.armTurnAttention,
    };
    return bundle;
  })();
  try {
    return await loading;
  } finally {
    loading = null;
  }
}

export function tryAgentStores(): AgentStoreBundle | null {
  return bundle;
}

export function agentStores(): AgentStoreBundle {
  if (!bundle) {
    throw new Error('agent stores are not loaded: await the agent runtime boot first');
  }
  return bundle;
}

export function tryChatStore(provider: NativeAgentProvider): AgentChatStore | null {
  return bundle ? bundle.chatStoreFor(provider) : null;
}

export function chatStore(provider: NativeAgentProvider): AgentChatStore {
  return agentStores().chatStoreFor(provider);
}

export function chatState(provider: NativeAgentProvider): AgentChatState | null {
  return tryChatStore(provider)?.getState() ?? null;
}

const inertChatStore: StoreApi<AgentChatState | null> = {
  getState: () => null,
  getInitialState: () => null,
  setState: () => undefined,
  subscribe: () => () => undefined,
};

export function useChatStore<T>(
  provider: NativeAgentProvider,
  selector: (state: AgentChatState) => T,
  fallback: T
): T {
  const store = (tryChatStore(provider) as StoreApi<AgentChatState | null> | null) ?? inertChatStore;
  return useStore(store, (state) => (state ? selector(state) : fallback));
}

export function resetChatStore(provider: NativeAgentProvider): void {
  const store = tryChatStore(provider);
  if (!store) {
    return;
  }
  muteAgentAttention(() => store.setState(store.getInitialState(), true));
}

export function resetAllChatStores(): void {
  muteAgentAttention(() => {
    for (const provider of AGENT_PROVIDERS) {
      resetChatStore(provider);
    }
  });
}
