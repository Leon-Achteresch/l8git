import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type CommitPrefs = {
  messageTemplate: string;
  setMessageTemplate: (value: string) => void;
  showConventionalCommitIcons: boolean;
  setShowConventionalCommitIcons: (value: boolean) => void;
};

export const useCommitPrefs = create<CommitPrefs>()(
  persist(
    (set) => ({
      messageTemplate: "",
      setMessageTemplate: (value) => set({ messageTemplate: value }),
      showConventionalCommitIcons: true,
      setShowConventionalCommitIcons: (showConventionalCommitIcons) =>
        set({ showConventionalCommitIcons }),
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
