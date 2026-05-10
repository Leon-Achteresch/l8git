import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type Workspace = {
  id: string;
  name: string;
  repoPaths: string[];
};

type WorkspaceState = {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  addWorkspace: (name: string) => void;
  removeWorkspace: (id: string) => void;
  renameWorkspace: (id: string, name: string) => void;
  setActiveWorkspace: (id: string) => void;
  addRepoToActiveWorkspace: (path: string) => void;
  removeRepoFromAllWorkspaces: (path: string) => void;
  initDefaultWorkspace: (paths: string[]) => void;
};

const DEFAULT_WORKSPACE_ID = "default";

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: [{ id: DEFAULT_WORKSPACE_ID, name: "Persönlich", repoPaths: [] }],
      activeWorkspaceId: DEFAULT_WORKSPACE_ID,

      addWorkspace: (name) => {
        const id = crypto.randomUUID();
        set((s) => ({
          workspaces: [...s.workspaces, { id, name, repoPaths: [] }],
        }));
      },

      removeWorkspace: (id) => {
        set((s) => {
          if (s.workspaces.length <= 1) return s;
          const remaining = s.workspaces.filter((w) => w.id !== id);
          const activeId =
            s.activeWorkspaceId === id
              ? (remaining[0]?.id ?? DEFAULT_WORKSPACE_ID)
              : s.activeWorkspaceId;
          return { workspaces: remaining, activeWorkspaceId: activeId };
        });
      },

      renameWorkspace: (id, name) => {
        set((s) => ({
          workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, name } : w)),
        }));
      },

      setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),

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

      initDefaultWorkspace: (paths) => {
        const { workspaces } = get();
        const defaultWs = workspaces.find((w) => w.id === DEFAULT_WORKSPACE_ID);
        if (defaultWs && defaultWs.repoPaths.length === 0 && paths.length > 0) {
          set((s) => ({
            workspaces: s.workspaces.map((w) =>
              w.id === DEFAULT_WORKSPACE_ID ? { ...w, repoPaths: paths } : w,
            ),
          }));
        }
      },
    }),
    {
      name: "l8git-workspaces",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
