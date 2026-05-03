import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type CommitPrefs = {
  messageTemplate: string;
  setMessageTemplate: (value: string) => void;
  showConventionalCommitIcons: boolean;
  setShowConventionalCommitIcons: (value: boolean) => void;
  aiPromptTemplate: string;
  setAiPromptTemplate: (value: string) => void;
  aiOutputLanguage: string;
  setAiOutputLanguage: (value: string) => void;
};

export const useCommitPrefs = create<CommitPrefs>()(
  persist(
    (set) => ({
      messageTemplate: "",
      setMessageTemplate: (value) => set({ messageTemplate: value }),
      showConventionalCommitIcons: true,
      setShowConventionalCommitIcons: (showConventionalCommitIcons) =>
        set({ showConventionalCommitIcons }),
      aiPromptTemplate: "",
      setAiPromptTemplate: (value) => set({ aiPromptTemplate: value }),
      aiOutputLanguage: "English",
      setAiOutputLanguage: (value) => set({ aiOutputLanguage: value }),
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
