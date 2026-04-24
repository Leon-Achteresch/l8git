import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type RepoTerminalKind = "default" | "git_bash";

export type PushForceMode = "none" | "lease" | "force";
export type PushTagsMode = "none" | "follow" | "all";

type WorkspacePrefs = {
  ideLaunchCommand: string;
  setIdeLaunchCommand: (value: string) => void;
  repoTerminalKind: RepoTerminalKind;
  setRepoTerminalKind: (value: RepoTerminalKind) => void;
  fetchPruneBranches: boolean;
  setFetchPruneBranches: (value: boolean) => void;
  fetchPruneTags: boolean;
  setFetchPruneTags: (value: boolean) => void;
  pushForceMode: PushForceMode;
  setPushForceMode: (value: PushForceMode) => void;
  pushTagsMode: PushTagsMode;
  setPushTagsMode: (value: PushTagsMode) => void;
  pushAtomic: boolean;
  setPushAtomic: (value: boolean) => void;
  pushNoVerify: boolean;
  setPushNoVerify: (value: boolean) => void;
  pushDryRun: boolean;
  setPushDryRun: (value: boolean) => void;
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
      pushForceMode: "none" as PushForceMode,
      setPushForceMode: (pushForceMode) => set({ pushForceMode }),
      pushTagsMode: "none" as PushTagsMode,
      setPushTagsMode: (pushTagsMode) => set({ pushTagsMode }),
      pushAtomic: false,
      setPushAtomic: (pushAtomic) => set({ pushAtomic }),
      pushNoVerify: false,
      setPushNoVerify: (pushNoVerify) => set({ pushNoVerify }),
      pushDryRun: false,
      setPushDryRun: (pushDryRun) => set({ pushDryRun }),
    }),
    {
      name: "l8git-workspace-prefs",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
