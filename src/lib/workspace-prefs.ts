import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type RepoTerminalKind = "default" | "git_bash";

export type PushForceMode = "none" | "lease" | "force";
export type PushTagsMode = "none" | "follow" | "all";
export type PullStrategy = "merge" | "rebase" | "ff-only" | "autostash";
export const SHELL_LAYOUTS = [
  "rail",
  "classic",
  "twoRow",
  "breadcrumb",
  "activityBar",
  "sidebar",
  "expose",
  "statusBar",
] as const;
export type ShellLayout = (typeof SHELL_LAYOUTS)[number];

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
  pullStrategy: PullStrategy;
  setPullStrategy: (value: PullStrategy) => void;
  previewAiContext: boolean;
  setPreviewAiContext: (value: boolean) => void;
  shellLayout: ShellLayout;
  setShellLayout: (value: ShellLayout) => void;
  navLabels: boolean;
  setNavLabels: (value: boolean) => void;
  uiDensity: "compact" | "comfortable";
  setUiDensity: (value: "compact" | "comfortable") => void;
  uiScale: number;
  setUiScale: (value: number) => void;
  hideT3Checkpoints: boolean;
  setHideT3Checkpoints: (value: boolean) => void;
  embeddedTerminalCommand: string;
  setEmbeddedTerminalCommand: (value: string) => void;
  terminalButtonMode: "embedded" | "external";
  setTerminalButtonMode: (value: "embedded" | "external") => void;
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
      pullStrategy: "merge" as PullStrategy,
      setPullStrategy: (pullStrategy) => set({ pullStrategy }),
      previewAiContext: true,
      setPreviewAiContext: (previewAiContext) => set({ previewAiContext }),
      shellLayout: "rail" as ShellLayout,
      setShellLayout: (shellLayout) => set({ shellLayout }),
      navLabels: true,
      setNavLabels: (navLabels) => set({ navLabels }),
      uiDensity: "comfortable",
      setUiDensity: (uiDensity) => set({ uiDensity }),
      uiScale: 1.0,
      setUiScale: (uiScale) => set({ uiScale: Math.min(1.5, Math.max(0.7, uiScale)) }),
      hideT3Checkpoints: true,
      setHideT3Checkpoints: (hideT3Checkpoints) => set({ hideT3Checkpoints }),
      embeddedTerminalCommand: "",
      setEmbeddedTerminalCommand: (embeddedTerminalCommand) =>
        set({ embeddedTerminalCommand }),
      terminalButtonMode: "embedded" as const,
      setTerminalButtonMode: (terminalButtonMode) => set({ terminalButtonMode }),
    }),
    {
      name: "l8git-workspace-prefs",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
