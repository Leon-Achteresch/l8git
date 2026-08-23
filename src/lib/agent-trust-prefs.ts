import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { platformStorage } from "@/lib/platform/kv";

type AgentTrustPrefs = {
  trustedByRepo: Record<string, boolean>;
  setRepoTrusted: (repoPath: string, trusted: boolean) => void;
};

function normalizeRepoKey(repoPath: string): string {
  return repoPath.trim().replace(/[/\\]+$/, "");
}

export const useAgentTrustPrefs = create<AgentTrustPrefs>()(
  persist(
    (set) => ({
      trustedByRepo: {},
      setRepoTrusted: (repoPath, trusted) =>
        set((state) => {
          const key = normalizeRepoKey(repoPath);
          if (!key) return state;
          return { trustedByRepo: { ...state.trustedByRepo, [key]: trusted } };
        }),
    }),
    {
      name: "l8git-agent-trust-prefs",
      storage: createJSONStorage(() => platformStorage),
    },
  ),
);

export function isRepoAgentsTrusted(repoPath: string): boolean {
  const key = normalizeRepoKey(repoPath);
  if (!key) return false;
  return useAgentTrustPrefs.getState().trustedByRepo[key] === true;
}

export function setRepoAgentsTrusted(repoPath: string, trusted: boolean): void {
  useAgentTrustPrefs.getState().setRepoTrusted(repoPath, trusted);
}
