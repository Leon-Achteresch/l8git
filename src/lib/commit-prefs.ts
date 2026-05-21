import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type AiProviderType = "openai" | "anthropic" | "google" | "openrouter" | "ollama" | "compatible";

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
  aiPromptTemplate: string;
  setAiPromptTemplate: (value: string) => void;
  aiOutputLanguage: string;
  setAiOutputLanguage: (value: string) => void;
  aiProviderType: AiProviderType;
  setAiProviderType: (value: AiProviderType) => void;
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
    },
  ),
);

export function getCommitMessageTemplate(): string {
  return useCommitPrefs.getState().messageTemplate;
}
