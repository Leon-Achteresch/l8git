import { create } from 'zustand';

import type { ProviderOverviewInput, ThreadCost } from '@desktop/lib/agents/overview';

import {
  emptyHostSnapshot,
  type AgentHostSnapshot,
} from './overview-aggregator';
import { AGENT_PROVIDERS, tryChatStore, type NativeAgentProvider } from './stores';

interface SnapshotState {
  byHost: Record<string, AgentHostSnapshot>;
  put: (snapshot: AgentHostSnapshot) => void;
  markOnline: (hostId: string, hostName: string, online: boolean) => void;
  drop: (hostId: string) => void;
}

export const useAgentSnapshots = create<SnapshotState>((set, get) => ({
  byHost: {},

  put: (snapshot) => set((state) => ({ byHost: { ...state.byHost, [snapshot.hostId]: snapshot } })),

  markOnline: (hostId, hostName, online) => {
    const current = get().byHost[hostId] ?? emptyHostSnapshot(hostId, hostName, online);
    if (current.online === online && current.hostName === hostName && get().byHost[hostId]) {
      return;
    }
    set((state) => ({
      byHost: {
        ...state.byHost,
        [hostId]: { ...current, hostName, online, bound: online ? current.bound : false },
      },
    }));
  },

  drop: (hostId) =>
    set((state) => {
      const byHost = { ...state.byHost };
      delete byHost[hostId];
      return { byHost };
    }),
}));

function providerInput(provider: NativeAgentProvider): ProviderOverviewInput | null {
  const state = tryChatStore(provider)?.getState();
  if (!state) {
    return null;
  }
  const hasThreads = Object.values(state.threadsByPath).some((threads) => threads.length > 0);
  if (!hasThreads) {
    return null;
  }
  return {
    threadsByPath: state.threadsByPath,
    conversations: state.conversations,
    requestsByThread: state.requestsByThread,
  };
}

export interface CaptureOptions {
  hostId: string;
  hostName: string;
  online: boolean;
  knownPaths: readonly string[];
  worktrees?: AgentHostSnapshot['worktrees'];
  ledger?: Record<string, ThreadCost>;
}

export function captureHostSnapshot(options: CaptureOptions): AgentHostSnapshot {
  const providers: AgentHostSnapshot['providers'] = {};
  for (const provider of AGENT_PROVIDERS) {
    const input = providerInput(provider);
    if (input) {
      providers[provider] = input;
    }
  }
  return {
    hostId: options.hostId,
    hostName: options.hostName,
    online: options.online,
    bound: true,
    capturedAt: Date.now(),
    providers,
    worktrees: options.worktrees ?? {},
    ledger: options.ledger ?? {},
    knownPaths: options.knownPaths,
  };
}

export function recordHostSnapshot(options: CaptureOptions): void {
  useAgentSnapshots.getState().put(captureHostSnapshot(options));
}

export function unbindHostSnapshot(hostId: string): void {
  const current = useAgentSnapshots.getState().byHost[hostId];
  if (!current || !current.bound) {
    return;
  }
  useAgentSnapshots.getState().put({ ...current, bound: false });
}
