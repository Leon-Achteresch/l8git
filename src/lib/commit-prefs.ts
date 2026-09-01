import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type AiProviderType = "openai" | "anthropic" | "google" | "openrouter" | "ollama" | "compatible";

export type CommitDiffViewMode = "edit" | "stage";

export type DiffLayoutMode = "inline" | "sideBySide";

export type MergeEditorMode = "3way" | "2way";

export const AI_PROVIDER_DEFAULT_MODELS: Record<AiProviderType, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
  google: "gemini-2.0-flash",
  openrouter: "deepseek/deepseek-v4-flash",
  ollama: "llama3.2",
  compatible: "",
};

type CommitPrefs = {
  messageTemplate: string;
  setMessageTemplate: (value: string) => void;
  showConventionalCommitIcons: boolean;
  setShowConventionalCommitIcons: (value: boolean) => void;
  showCommitDateGroups: boolean;
  setShowCommitDateGroups: (value: boolean) => void;
  fileTreeView: boolean;
  setFileTreeView: (value: boolean) => void;
  diffViewMode: CommitDiffViewMode;
  setDiffViewMode: (value: CommitDiffViewMode) => void;
  diffLayoutMode: DiffLayoutMode;
  setDiffLayoutMode: (value: DiffLayoutMode) => void;
  toggleDiffLayoutMode: () => void;
  mergeEditorMode: MergeEditorMode;
  setMergeEditorMode: (value: MergeEditorMode) => void;
  toggleMergeEditorMode: () => void;
  aiPromptTemplate: string;
  setAiPromptTemplate: (value: string) => void;
  aiOutputLanguage: string;
  setAiOutputLanguage: (value: string) => void;
  aiProviderType: AiProviderType;
  setAiProviderType: (value: AiProviderType) => void;
  /** In-memory only – never persisted to localStorage. Populated from OS keyring on app start. */
  aiProviderApiKey: string;
  setAiProviderApiKey: (value: string) => void;
  aiProviderModel: string;
  setAiProviderModel: (value: string) => void;
  aiProviderBaseUrl: string;
  setAiProviderBaseUrl: (value: string) => void;
  graphLanePxMin: number;
  setGraphLanePxMin: (value: number) => void;
  graphLanePxMax: number;
  setGraphLanePxMax: (value: number) => void;
};

export const useCommitPrefs = create<CommitPrefs>()(
  persist(
    (set) => ({
      messageTemplate: "",
      setMessageTemplate: (value) => set({ messageTemplate: value }),
      showConventionalCommitIcons: true,
      setShowConventionalCommitIcons: (showConventionalCommitIcons) =>
        set({ showConventionalCommitIcons }),
      showCommitDateGroups: true,
      setShowCommitDateGroups: (showCommitDateGroups) =>
        set({ showCommitDateGroups }),
      fileTreeView: true,
      setFileTreeView: (fileTreeView) => set({ fileTreeView }),
      diffViewMode: "stage",
      setDiffViewMode: (diffViewMode) => set({ diffViewMode }),
      diffLayoutMode: "inline",
      setDiffLayoutMode: (diffLayoutMode) => set({ diffLayoutMode }),
      toggleDiffLayoutMode: () =>
        set((s) => ({
          diffLayoutMode: s.diffLayoutMode === "inline" ? "sideBySide" : "inline",
        })),
      mergeEditorMode: "3way",
      setMergeEditorMode: (mergeEditorMode) => set({ mergeEditorMode }),
      toggleMergeEditorMode: () =>
        set((s) => ({
          mergeEditorMode: s.mergeEditorMode === "3way" ? "2way" : "3way",
        })),
      aiPromptTemplate: "",
      setAiPromptTemplate: (value) => set({ aiPromptTemplate: value }),
      aiOutputLanguage: "English",
      setAiOutputLanguage: (value) => set({ aiOutputLanguage: value }),
      aiProviderType: "openrouter",
      setAiProviderType: (value) => set({ aiProviderType: value }),
      aiProviderApiKey: "",
      setAiProviderApiKey: (value) => set({ aiProviderApiKey: value }),
      aiProviderModel: "",
      setAiProviderModel: (value) => set({ aiProviderModel: value }),
      aiProviderBaseUrl: "",
      setAiProviderBaseUrl: (value) => set({ aiProviderBaseUrl: value }),
      graphLanePxMin: 36,
      setGraphLanePxMin: (graphLanePxMin) => set({ graphLanePxMin }),
      graphLanePxMax: 160,
      setGraphLanePxMax: (graphLanePxMax) => set({ graphLanePxMax }),
    }),
    {
      name: "l8git-commit-prefs",
      storage: createJSONStorage(() => localStorage),
      // API key is stored in the OS keyring, not in localStorage.
      partialize: (s) => {
        const { aiProviderApiKey: _key, setAiProviderApiKey: _set, ...rest } = s;
        return rest as Omit<CommitPrefs, "aiProviderApiKey" | "setAiProviderApiKey">;
      },
    },
  ),
);

export function getCommitMessageTemplate(): string {
  return useCommitPrefs.getState().messageTemplate;
}
