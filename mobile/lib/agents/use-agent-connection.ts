import * as React from 'react';
import { create } from 'zustand';

import { getClient, useConnections, useHostMeta, useHostRuntime } from '~/lib/connections';
import { useHostRepoPaths } from '~/lib/repo/registry';

import { applyProviderForHost, useActiveProvider } from './provider-selection';
import { useAgentRuntime } from './runtime';
import { recordHostSnapshot, unbindHostSnapshot, useAgentSnapshots } from './snapshots';
import {
  resetAllChatStores,
  tryChatStore,
  useChatStore,
  type NativeAgentProvider,
} from './stores';

export type AgentBindingStatus = 'idle' | 'offline' | 'connecting' | 'ready' | 'error';

const SNAPSHOT_THROTTLE_MS = 750;

interface BindingState {
  hostId: string | null;
  epoch: number;
}

export const useAgentBinding = create<BindingState>(() => ({ hostId: null, epoch: 0 }));

let boundClient: unknown = null;

export function boundAgentHostId(): string | null {
  return useAgentBinding.getState().hostId;
}

function unbind(): void {
  const { hostId } = useAgentBinding.getState();
  if (hostId) {
    unbindHostSnapshot(hostId);
  }
  boundClient = null;
  useAgentBinding.setState({ hostId: null });
  resetAllChatStores();
}

export interface AgentConnection {
  hostId: string | null;
  hostName: string | null;
  provider: NativeAgentProvider;
  status: AgentBindingStatus;
  error: string | null;
  bound: boolean;
  reconnect: () => void;
}

export function useAgentConnection(hostId: string | null | undefined): AgentConnection {
  const target = hostId ?? null;
  const runtimePhase = useAgentRuntime((state) => state.phase);
  const hostRuntime = useHostRuntime(target);
  const meta = useHostMeta(target);
  const clientEpoch = useConnections((state) => state.clientEpoch);
  const provider = useActiveProvider();
  const knownPaths = useHostRepoPaths(target);
  const bound = useAgentBinding((state) => state.hostId);
  const [attempt, setAttempt] = React.useState(0);

  const ready = runtimePhase === 'ready';
  const online = hostRuntime.status === 'online';

  React.useEffect(() => {
    if (!ready) {
      return;
    }
    if (!target || !online) {
      if (useAgentBinding.getState().hostId) {
        unbind();
      }
      return;
    }

    const client = getClient(target);
    if (useAgentBinding.getState().hostId !== target || boundClient !== client) {
      resetAllChatStores();
      boundClient = client;
      useAgentBinding.setState({ hostId: target, epoch: clientEpoch });
    }
    useConnections.getState().setActiveHost(target);
    applyProviderForHost(target);

    let released: (() => void) | null = null;
    let cancelled = false;
    const store = tryChatStore(provider);
    if (store) {
      released = store.getState().retainSurface();
      void store
        .getState()
        .connect()
        .catch(() => undefined)
        .then(() => {
          if (cancelled) {
            return;
          }
          recordHostSnapshot({
            hostId: target,
            hostName: meta?.name ?? target,
            online: true,
            knownPaths,
          });
        });
    }

    return () => {
      cancelled = true;
      released?.();
    };
  }, [attempt, clientEpoch, knownPaths, meta?.name, online, provider, ready, target]);

  React.useEffect(() => {
    if (!ready || !target || !online) {
      return;
    }
    const store = tryChatStore(provider);
    if (!store) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = store.subscribe(() => {
      if (timer) {
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        recordHostSnapshot({
          hostId: target,
          hostName: meta?.name ?? target,
          online: true,
          knownPaths,
        });
      }, SNAPSHOT_THROTTLE_MS);
    });
    return () => {
      off();
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [knownPaths, meta?.name, online, provider, ready, target]);

  React.useEffect(() => {
    if (!target) {
      return;
    }
    useAgentSnapshots.getState().markOnline(target, meta?.name ?? target, online);
  }, [meta?.name, online, target]);

  const connectionStatus = useChatStore(provider, (state) => state.connectionStatus, 'idle');
  const connectionError = useChatStore(provider, (state) => state.connectionError, null);
  const status: AgentBindingStatus = !target
    ? 'idle'
    : !online
      ? 'offline'
      : !ready
        ? 'connecting'
        : connectionStatus === 'ready'
          ? 'ready'
          : connectionStatus === 'error'
            ? 'error'
            : 'connecting';

  return {
    hostId: target,
    hostName: meta?.name ?? null,
    provider,
    status,
    error: connectionError ?? hostRuntime.lastError ?? null,
    bound: bound === target && target !== null,
    reconnect: React.useCallback(() => {
      unbind();
      setAttempt((value) => value + 1);
    }, []),
  };
}
