import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import i18n from "@/lib/i18n";
import { platformStorage } from "@/lib/platform/kv";
import {
  filterForest,
  flattenRepoPaths,
  useRepoGroupsStore,
} from "@/lib/repo-groups-store";

export type Workspace = {
  id: string;
  name: string;
  repoPaths: string[];
  /** Repo that was open when the user last left this workspace. */
  lastRepoPath?: string;
};

type WorkspaceState = {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  addWorkspace: (name: string) => void;
  removeWorkspace: (id: string) => void;
  renameWorkspace: (id: string, name: string) => void;
  setActiveWorkspace: (id: string) => void;
  rememberRepo: (path: string) => void;
  addRepoToActiveWorkspace: (path: string) => void;
  removeRepoFromAllWorkspaces: (path: string) => void;
  moveReposToWorkspace: (paths: string[], workspaceId: string) => void;
  initDefaultWorkspace: (paths: string[]) => void;
};

const DEFAULT_WORKSPACE_ID = "default";

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      workspaces: [{ id: DEFAULT_WORKSPACE_ID, name: i18n.t("repoWorkspaceSwitch.defaultPersonalName"), repoPaths: [] }],
      activeWorkspaceId: DEFAULT_WORKSPACE_ID,

      addWorkspace: (name) => {
        const id = crypto.randomUUID();
        set((s) => ({
          workspaces: [...s.workspaces, { id, name, repoPaths: [] }],
        }));
      },

      removeWorkspace: (id) => {
        set((s) => {
          const removed = s.workspaces.find((w) => w.id === id);
          if (!removed || s.workspaces.length <= 1) return s;
          const remaining = s.workspaces.filter((w) => w.id !== id);
          const activeId =
            s.activeWorkspaceId === id ? remaining[0].id : s.activeWorkspaceId;
          // Its repos stay open, so they move to the active workspace instead of losing their tabs.
          const workspaces = remaining.map((w) =>
            w.id === activeId
              ? {
                  ...w,
                  repoPaths: [
                    ...w.repoPaths,
                    ...removed.repoPaths.filter((p) => !w.repoPaths.includes(p)),
                  ],
                }
              : w,
          );
          return { workspaces, activeWorkspaceId: activeId };
        });
      },

      renameWorkspace: (id, name) => {
        set((s) => ({
          workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, name } : w)),
        }));
      },

      setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),

      rememberRepo: (path) => {
        set((s) => {
          const owner =
            s.workspaces.find((w) => w.id === s.activeWorkspaceId && w.repoPaths.includes(path)) ??
            s.workspaces.find((w) => w.repoPaths.includes(path));
          if (!owner || owner.lastRepoPath === path) return s;
          return {
            workspaces: s.workspaces.map((w) =>
              w === owner ? { ...w, lastRepoPath: path } : w,
            ),
          };
        });
      },

      addRepoToActiveWorkspace: (path) => {
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id === s.activeWorkspaceId && !w.repoPaths.includes(path)
              ? { ...w, repoPaths: [...w.repoPaths, path] }
              : w,
          ),
        }));
      },

      removeRepoFromAllWorkspaces: (path) => {
        set((s) => ({
          workspaces: s.workspaces.map((w) => ({
            ...w,
            repoPaths: w.repoPaths.filter((p) => p !== path),
          })),
        }));
      },

      moveReposToWorkspace: (paths, workspaceId) => {
        if (paths.length === 0) return;
        set((s) => {
          if (!s.workspaces.some((w) => w.id === workspaceId)) return s;
          const moving = new Set(paths);
          return {
            workspaces: s.workspaces.map((w) => {
              const kept = w.repoPaths.filter((p) => !moving.has(p));
              if (w.id !== workspaceId) {
                return kept.length === w.repoPaths.length
                  ? w
                  : { ...w, repoPaths: kept };
              }
              return { ...w, repoPaths: [...kept, ...paths] };
            }),
          };
        });
      },

      initDefaultWorkspace: (paths) => {
        set((s) => {
          // Only adopt repos without a workspace; refilling an empty default would put repos in two workspaces.
          const owned = new Set(s.workspaces.flatMap((w) => w.repoPaths));
          const orphans = paths.filter((p) => !owned.has(p));
          if (orphans.length === 0) return s;
          const target = s.workspaces.some((w) => w.id === DEFAULT_WORKSPACE_ID)
            ? DEFAULT_WORKSPACE_ID
            : s.activeWorkspaceId;
          return {
            workspaces: s.workspaces.map((w) =>
              w.id === target
                ? { ...w, repoPaths: [...w.repoPaths, ...orphans] }
                : w,
            ),
          };
        });
      },
    }),
    {
      name: "l8git-workspaces",
      storage: createJSONStorage(() => platformStorage),
      version: 1,
      migrate: (state) => dropDefaultCopies(state as WorkspaceState),
    },
  ),
);

/**
 * Version 0 refilled an emptied default workspace with every open repo, so
 * repos sat in two workspaces. The other workspace is the one the user chose.
 */
export function dropDefaultCopies<S extends Pick<WorkspaceState, "workspaces">>(state: S): S {
  if (!Array.isArray(state?.workspaces)) return state;
  const elsewhere = new Set(
    state.workspaces
      .filter((w) => w.id !== DEFAULT_WORKSPACE_ID)
      .flatMap((w) => w.repoPaths),
  );
  return {
    ...state,
    workspaces: state.workspaces.map((w) =>
      w.id === DEFAULT_WORKSPACE_ID
        ? { ...w, repoPaths: w.repoPaths.filter((p) => !elsewhere.has(p)) }
        : w,
    ),
  };
}

/**
 * The repo a workspace should show: the one last open in it, else its first
 * tab, else none. Only repos that are still open (`openPaths`) qualify.
 */
export function workspaceRepo(
  workspaceId: string,
  openPaths: readonly string[],
): string | null {
  const ws = useWorkspaceStore
    .getState()
    .workspaces.find((w) => w.id === workspaceId);
  if (!ws) return null;
  const open = new Set(openPaths.filter((p) => ws.repoPaths.includes(p)));
  if (ws.lastRepoPath && open.has(ws.lastRepoPath)) return ws.lastRepoPath;
  const forest = useRepoGroupsStore.getState().forest;
  return flattenRepoPaths(filterForest(forest, open))[0] ?? [...open][0] ?? null;
}
