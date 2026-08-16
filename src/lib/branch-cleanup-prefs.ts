import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { DEFAULT_STALE_DAYS, clampStaleDays } from "@/lib/branch-cleanup";

type BranchCleanupPrefs = {
  staleDays: number;
  setStaleDays: (value: number) => void;
  hintOnRepoOpen: boolean;
  setHintOnRepoOpen: (value: boolean) => void;
};

export const useBranchCleanupPrefs = create<BranchCleanupPrefs>()(
  persist(
    (set) => ({
      staleDays: DEFAULT_STALE_DAYS,
      setStaleDays: (value) => set({ staleDays: clampStaleDays(value) }),
      hintOnRepoOpen: false,
      setHintOnRepoOpen: (hintOnRepoOpen) => set({ hintOnRepoOpen }),
    }),
    {
      name: "l8git-branch-cleanup-prefs",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
