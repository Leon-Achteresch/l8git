import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

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
  /** Minimum graph-column width in pixels (≥ 20). */
  graphLanePxMin: number;
  setGraphLanePxMin: (value: number) => void;
  /** Maximum graph-column width in pixels (≤ 240). */
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
