import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { create } from "zustand";

import type { ProviderCapabilities } from "./pr-provider";

type PrProviderState = {
  capsByPath: Record<string, ProviderCapabilities>;
  pending: Record<string, boolean>;
  loadCapabilities: (path: string) => Promise<void>;
};

export const usePrProviderStore = create<PrProviderState>((set, get) => ({
  capsByPath: {},
  pending: {},
  loadCapabilities: async (path) => {
    if (get().pending[path] || get().capsByPath[path]) return;
    set((s) => ({ pending: { ...s.pending, [path]: true } }));
    try {
      const caps = await invoke<ProviderCapabilities>(
        "pr_provider_capabilities",
        { path },
      );
      set((s) => ({
        capsByPath: { ...s.capsByPath, [path]: caps },
        pending: { ...s.pending, [path]: false },
      }));
    } catch {
      set((s) => ({ pending: { ...s.pending, [path]: false } }));
    }
  },
}));

export function usePrCapabilities(path: string): ProviderCapabilities | null {
  const caps = usePrProviderStore((s) => s.capsByPath[path]);
  const load = usePrProviderStore((s) => s.loadCapabilities);
  useEffect(() => {
    void load(path);
  }, [path, load]);
  return caps ?? null;
}
