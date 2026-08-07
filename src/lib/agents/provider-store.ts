import { create } from "zustand";

export type NativeAgentProvider = "codex" | "claude";

const STORAGE_KEY = "l8git.agent-provider";

function initialProvider(): NativeAgentProvider {
  if (typeof window === "undefined") return "codex";
  return window.localStorage.getItem(STORAGE_KEY) === "claude" ? "claude" : "codex";
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
