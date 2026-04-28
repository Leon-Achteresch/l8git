import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export const SIDEBAR_MIN_WIDTH = 240;
export const SIDEBAR_MAX_WIDTH = 560;
export const SIDEBAR_DEFAULT_WIDTH = 256;

export type SidebarTab = "commit" | "history" | "stash" | "pr" | "ci" | "submodules";

export type CommitFocusRequest = {
  path: string;
  hash: string;
  id: number;
};

export type PrCreateRequest = {
  path: string;
  head: string;
  id: number;
};

type UiState = {
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  sidebarTab: SidebarTab;
  setSidebarTab: (tab: SidebarTab) => void;
  commitFocusRequest: CommitFocusRequest | null;
  focusCommitFromBranchTip: (path: string, tipHash: string) => void;
  clearCommitFocusRequest: () => void;
  prCreateRequest: PrCreateRequest | null;
  requestPrCreate: (path: string, head: string) => void;
  clearPrCreateRequest: () => void;
};

const clamp = (v: number) =>
  Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, v));

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
      setSidebarWidth: (width) => set({ sidebarWidth: clamp(width) }),
      sidebarTab: "history",
      setSidebarTab: (tab) => set({ sidebarTab: tab }),
      commitFocusRequest: null,
      focusCommitFromBranchTip: (path, tipHash) =>
        set((s) => ({
          sidebarTab: "history",
          commitFocusRequest: {
            path,
            hash: tipHash,
            id: (s.commitFocusRequest?.id ?? 0) + 1,
          },
        })),
      clearCommitFocusRequest: () => set({ commitFocusRequest: null }),
      prCreateRequest: null,
      requestPrCreate: (path, head) =>
        set((s) => ({
          sidebarTab: "pr",
          prCreateRequest: {
            path,
            head,
            id: (s.prCreateRequest?.id ?? 0) + 1,
          },
        })),
      clearPrCreateRequest: () => set({ prCreateRequest: null }),
    }),
    {
      name: "l8git-ui",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        sidebarWidth: s.sidebarWidth,
        sidebarTab: s.sidebarTab,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<
          Pick<UiState, "sidebarWidth" | "sidebarTab">
        >;
        return {
          ...current,
          sidebarTab: p.sidebarTab ?? current.sidebarTab,
          sidebarWidth: clamp(p.sidebarWidth ?? current.sidebarWidth),
        };
      },
    },
  ),
);
