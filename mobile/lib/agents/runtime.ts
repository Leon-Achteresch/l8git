import * as React from 'react';
import { create } from 'zustand';

import { AGENT_STORAGE_KEYS } from '@desktop/lib/agents/storage-keys';
import { hasPlatform } from '@desktop/lib/platform';
import { hydrateKv } from '@desktop/lib/platform/kv';

import { registerRemotePlatform } from '~/lib/platform-remote';

import { installTurnAttentionSink } from './attention';
import { runAgentBoot, type AgentBootStep } from './boot-sequence';
import { installKnownRepoPathsSource } from './known-repos';
import { installAppSuspendBridge } from './lifecycle';
import { useProviderSelection } from './provider-selection';
import { loadAgentStores, tryAgentStores } from './stores';

export type AgentRuntimePhase = 'idle' | 'booting' | 'ready' | 'error';

interface AgentRuntimeState {
  phase: AgentRuntimePhase;
  step: AgentBootStep | null;
  error: string | null;
}

export const useAgentRuntime = create<AgentRuntimeState>(() => ({
  phase: 'idle',
  step: null,
  error: null,
}));

let boot: Promise<void> | null = null;
let teardown: Array<() => void> = [];

async function installBridges(): Promise<void> {
  const stores = tryAgentStores();
  teardown.push(installAppSuspendBridge());
  teardown.push(installKnownRepoPathsSource());
  teardown.push(await installTurnAttentionSink());
  if (stores) {
    teardown.push(stores.armTurnAttention());
  }
  await useProviderSelection.getState().hydrate();
}

export function startAgentRuntime(): Promise<void> {
  if (boot) {
    return boot;
  }
  useAgentRuntime.setState({ phase: 'booting', step: null, error: null });
  boot = runAgentBoot({
    hasPlatform,
    registerPlatform: () => {
      registerRemotePlatform();
    },
    storageKeys: AGENT_STORAGE_KEYS,
    hydrateKv,
    loadStores: async () => {
      await loadAgentStores();
    },
    installBridges,
    onStep: (step) => useAgentRuntime.setState({ step }),
  })
    .then(() => {
      useAgentRuntime.setState({ phase: 'ready', error: null });
    })
    .catch((cause: unknown) => {
      boot = null;
      useAgentRuntime.setState({
        phase: 'error',
        error: cause instanceof Error ? cause.message : String(cause),
      });
    });
  return boot;
}

export function stopAgentRuntime(): void {
  for (const off of teardown.splice(0)) {
    off();
  }
  teardown = [];
}

export function retryAgentRuntime(): void {
  stopAgentRuntime();
  boot = null;
  void startAgentRuntime();
}

export function useAgentRuntimeBoot(): AgentRuntimeState {
  const state = useAgentRuntime();
  React.useEffect(() => {
    void startAgentRuntime();
  }, []);
  return state;
}

export function useAgentsReady(): boolean {
  return useAgentRuntime((state) => state.phase === 'ready');
}
