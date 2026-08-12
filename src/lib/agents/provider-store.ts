import { create } from "zustand";

export type NativeAgentProvider = "codex" | "claude" | "opencode" | "cursor";

const STORAGE_KEY = "l8git.agent-provider";
const NATIVE_AGENT_PROVIDERS: NativeAgentProvider[] = ["codex", "claude", "opencode", "cursor"];

function initialProvider(): NativeAgentProvider {
  if (typeof window === "undefined") return "codex";
  const stored = window.localStorage.getItem(STORAGE_KEY) as NativeAgentProvider | null;
  return stored && NATIVE_AGENT_PROVIDERS.includes(stored) ? stored : "codex";
}

export const useAgentProviderStore = create<{
  provider: NativeAgentProvider;
  setProvider: (provider: NativeAgentProvider) => void;
}>((set) => ({
  provider: initialProvider(),
  setProvider: (provider) => {
    window.localStorage.setItem(STORAGE_KEY, provider);
    set({ provider });
  },
}));

export function activeAgentProvider(): NativeAgentProvider {
  return useAgentProviderStore.getState().provider;
}
