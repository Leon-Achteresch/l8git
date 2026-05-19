import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export const SIDEBAR_MIN_WIDTH = 240;
export const SIDEBAR_MAX_WIDTH = 560;
export const SIDEBAR_DEFAULT_WIDTH = 256;

export const GRID_SIDEBAR_MIN_WIDTH = 160;
export const GRID_SIDEBAR_MAX_WIDTH = 480;
export const GRID_SIDEBAR_DEFAULT_WIDTH = 200;

export type SidebarTab =
  | 'commit'
  | 'history'
  | 'stash'
  | 'pr'
  | 'ci'
  | 'submodules'
  | 'worktrees'
  | 'hooks';

export type CommitFocusRequest = {
  path: string;
  hash: string;
  id: number;
};

export type CommitSearchMatchStepDirection = 'prev' | 'next';

export type CommitSearchMatchStepRequest = {
  path: string;
  direction: CommitSearchMatchStepDirection;
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
  gridSidebarWidth: number;
  setGridSidebarWidth: (width: number) => void;
  sidebarTab: SidebarTab;
  setSidebarTab: (tab: SidebarTab) => void;
  commitFocusRequest: CommitFocusRequest | null;
  requestCommitHistoryFocus: (path: string, hash: string) => void;
  focusCommitFromBranchTip: (path: string, tipHash: string) => void;
  clearCommitFocusRequest: () => void;
  commitSearchMatchStepRequest: CommitSearchMatchStepRequest | null;
  requestCommitSearchMatchStep: (
    path: string,
    direction: CommitSearchMatchStepDirection
  ) => void;
  clearCommitSearchMatchStepRequest: () => void;
  prCreateRequest: PrCreateRequest | null;
  requestPrCreate: (path: string, head: string) => void;
  clearPrCreateRequest: () => void;
  branchFilterByPath: Record<string, ReadonlySet<string>>;
  setBranchFilter: (path: string, names: ReadonlySet<string>) => void;
  clearBranchFilter: (path: string) => void;
  mergeEditorPath: string | null;
  mergeEditorInitialFile: string | null;
  openMergeEditor: (path: string, file?: string) => void;
  closeMergeEditor: () => void;
  bisectVisible: boolean;
  setBisectVisible: (v: boolean) => void;
  bisectPending: Record<string, { bad: string | null; good: string | null }>;
  setBisectPendingBad: (path: string, hash: string | null) => void;
  setBisectPendingGood: (path: string, hash: string | null) => void;
  clearBisectPending: (path: string) => void;
};

const clamp = (v: number) =>
  Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, v));

const clampGrid = (v: number) =>
  Math.min(GRID_SIDEBAR_MAX_WIDTH, Math.max(GRID_SIDEBAR_MIN_WIDTH, v));

export const useUiStore = create<UiState>()(
  persist(
    set => ({
      sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
      setSidebarWidth: width => set({ sidebarWidth: clamp(width) }),
      gridSidebarWidth: GRID_SIDEBAR_DEFAULT_WIDTH,
      setGridSidebarWidth: width => set({ gridSidebarWidth: clampGrid(width) }),
      sidebarTab: 'history',
      setSidebarTab: tab => set({ sidebarTab: tab }),
      commitFocusRequest: null,
      requestCommitHistoryFocus: (path, hash) =>
        set(s => ({
          commitFocusRequest: {
            path,
            hash,
            id: (s.commitFocusRequest?.id ?? 0) + 1,
          },
        })),
      focusCommitFromBranchTip: (path, tipHash) =>
        set(s => ({
          sidebarTab: 'history',
          commitFocusRequest: {
            path,
            hash: tipHash,
            id: (s.commitFocusRequest?.id ?? 0) + 1,
          },
        })),
      clearCommitFocusRequest: () => set({ commitFocusRequest: null }),
      commitSearchMatchStepRequest: null,
      requestCommitSearchMatchStep: (path, direction) =>
        set(s => ({
          commitSearchMatchStepRequest: {
            path,
            direction,
            id: (s.commitSearchMatchStepRequest?.id ?? 0) + 1,
          },
        })),
      clearCommitSearchMatchStepRequest: () =>
        set({ commitSearchMatchStepRequest: null }),
      prCreateRequest: null,
      requestPrCreate: (path, head) =>
        set(s => ({
          sidebarTab: 'pr',
          prCreateRequest: {
            path,
            head,
            id: (s.prCreateRequest?.id ?? 0) + 1,
          },
        })),
      clearPrCreateRequest: () => set({ prCreateRequest: null }),
      branchFilterByPath: {},
      setBranchFilter: (path, names) =>
        set(s => ({
          branchFilterByPath: { ...s.branchFilterByPath, [path]: names },
        })),
      clearBranchFilter: path =>
        set(s => {
          const { [path]: _removed, ...rest } = s.branchFilterByPath;
          return { branchFilterByPath: rest };
        }),
      mergeEditorPath: null,
      mergeEditorInitialFile: null,
      openMergeEditor: (path, file) => set({ mergeEditorPath: path, mergeEditorInitialFile: file ?? null }),
      closeMergeEditor: () => set({ mergeEditorPath: null, mergeEditorInitialFile: null }),
      bisectVisible: true,
      setBisectVisible: v => set({ bisectVisible: v }),
      bisectPending: {},
      setBisectPendingBad: (path, hash) =>
        set(s => ({
          bisectPending: {
            ...s.bisectPending,
            [path]: { bad: hash, good: s.bisectPending[path]?.good ?? null },
          },
        })),
      setBisectPendingGood: (path, hash) =>
        set(s => ({
          bisectPending: {
            ...s.bisectPending,
            [path]: { bad: s.bisectPending[path]?.bad ?? null, good: hash },
          },
        })),
      clearBisectPending: path =>
        set(s => {
          const { [path]: _removed, ...rest } = s.bisectPending;
          return { bisectPending: rest };
        }),
    }),
    {
      name: 'l8git-ui',
      storage: createJSONStorage(() => localStorage),
      partialize: s => ({
        sidebarWidth: s.sidebarWidth,
        gridSidebarWidth: s.gridSidebarWidth,
        sidebarTab: s.sidebarTab,
        bisectVisible: s.bisectVisible,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<
          Pick<UiState, 'sidebarWidth' | 'gridSidebarWidth' | 'sidebarTab' | 'bisectVisible'>
        >;
        return {
          ...current,
          sidebarTab: p.sidebarTab ?? current.sidebarTab,
          sidebarWidth: clamp(p.sidebarWidth ?? current.sidebarWidth),
          gridSidebarWidth: clampGrid(p.gridSidebarWidth ?? current.gridSidebarWidth),
          bisectVisible: p.bisectVisible ?? current.bisectVisible,
        };
      },
    }
  )
);
