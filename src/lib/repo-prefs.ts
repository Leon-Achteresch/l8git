import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type RepoPrefsEntry = {
  aiOutputLanguage?: string;
};

type RepoPrefsState = {
  repos: Record<string, RepoPrefsEntry>;
  setAiOutputLanguage: (repoPath: string, lang: string | undefined) => void;
  getAiOutputLanguage: (repoPath: string) => string | undefined;
};

export const useRepoPrefs = create<RepoPrefsState>()(
  persist(
    (set, get) => ({
      repos: {},
      setAiOutputLanguage: (repoPath, lang) =>
        set((s) => ({
          repos: {
            ...s.repos,
            [repoPath]: { ...s.repos[repoPath], aiOutputLanguage: lang },
          },
        })),
      getAiOutputLanguage: (repoPath) => get().repos[repoPath]?.aiOutputLanguage,
    }),
    {
      name: "l8git-repo-prefs",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
