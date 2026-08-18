import { create } from "zustand";

import { kvGet, kvSet } from "@/lib/platform/kv";
import { AGENT_PROVIDER_KEY } from "@/lib/agents/storage-keys";

export type NativeAgentProvider = "codex" | "claude" | "opencode" | "cursor";

const NATIVE_AGENT_PROVIDERS: NativeAgentProvider[] = ["codex", "claude", "opencode", "cursor"];

function initialProvider(): NativeAgentProvider {
  const stored = kvGet(AGENT_PROVIDER_KEY) as NativeAgentProvider | null;
  return stored && NATIVE_AGENT_PROVIDERS.includes(stored) ? stored : "codex";
}

export const useAgentProviderStore = create<{
  provider: NativeAgentProvider;
  setProvider: (provider: NativeAgentProvider) => void;
}>((set) => ({
  provider: initialProvider(),
  setProvider: (provider) => {
    kvSet(AGENT_PROVIDER_KEY, provider);
    set({ provider });
  },
}));

export function activeAgentProvider(): NativeAgentProvider {
  return useAgentProviderStore.getState().provider;
}
