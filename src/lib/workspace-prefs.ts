import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type RepoTerminalKind = "default" | "git_bash";

type WorkspacePrefs = {
  ideLaunchCommand: string;
  setIdeLaunchCommand: (value: string) => void;
  repoTerminalKind: RepoTerminalKind;
  setRepoTerminalKind: (value: RepoTerminalKind) => void;
  fetchPruneBranches: boolean;
  setFetchPruneBranches: (value: boolean) => void;
  fetchPruneTags: boolean;
  setFetchPruneTags: (value: boolean) => void;
};

export const useWorkspacePrefs = create<WorkspacePrefs>()(
  persist(
    (set) => ({
      ideLaunchCommand: "",
      setIdeLaunchCommand: (ideLaunchCommand) => set({ ideLaunchCommand }),
      repoTerminalKind: "default" as RepoTerminalKind,
      setRepoTerminalKind: (repoTerminalKind) => set({ repoTerminalKind }),
      fetchPruneBranches: true,
      setFetchPruneBranches: (fetchPruneBranches) => set({ fetchPruneBranches }),
      fetchPruneTags: false,
      setFetchPruneTags: (fetchPruneTags) => set({ fetchPruneTags }),
    }),
    {
      name: "l8git-workspace-prefs",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
