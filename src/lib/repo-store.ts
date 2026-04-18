import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";

export type Commit = {
  hash: string;
  short_hash: string;
  author: string;
  email: string;
  date: string;
  subject: string;
};

export type RepoInfo = {
  path: string;
  branch: string;
  commits: Commit[];
};

type RepoState = {
  paths: string[];
  activePath: string | null;
  repos: Record<string, RepoInfo>;
  loading: Record<string, boolean>;
  errors: Record<string, string>;
  addRepo: (path: string) => Promise<void>;
  removeRepo: (path: string) => void;
  setActive: (path: string) => void;
  reload: (path: string) => Promise<void>;
  reloadAll: () => Promise<void>;
};

export const useRepoStore = create<RepoState>()(
  persist(
    (set, get) => ({
      paths: [],
      activePath: null,
      repos: {},
      loading: {},
      errors: {},

      async addRepo(path) {
        set((s) => ({ loading: { ...s.loading, [path]: true } }));
        try {
          const info = await invoke<RepoInfo>("open_repo", { path });
          set((s) => {
            const paths = s.paths.includes(info.path)
              ? s.paths
              : [...s.paths, info.path];
            const { [path]: _, ...restErr } = s.errors;
            const { [path]: __, ...restLoad } = s.loading;
            return {
              paths,
              activePath: info.path,
              repos: { ...s.repos, [info.path]: info },
              errors: restErr,
              loading: restLoad,
            };
          });
        } catch (e) {
          set((s) => ({
            errors: { ...s.errors, [path]: String(e) },
            loading: { ...s.loading, [path]: false },
          }));
        }
      },

      removeRepo(path) {
        set((s) => {
          const paths = s.paths.filter((p) => p !== path);
          const { [path]: _r, ...repos } = s.repos;
          const { [path]: _e, ...errors } = s.errors;
          const { [path]: _l, ...loading } = s.loading;
          const activePath =
            s.activePath === path ? (paths[0] ?? null) : s.activePath;
          return { paths, repos, errors, loading, activePath };
        });
      },

      setActive(path) {
        set({ activePath: path });
      },

      async reload(path) {
        set((s) => ({ loading: { ...s.loading, [path]: true } }));
        try {
          const info = await invoke<RepoInfo>("open_repo", { path });
          set((s) => {
            const { [path]: _, ...restErr } = s.errors;
            const { [path]: __, ...restLoad } = s.loading;
            return {
              repos: { ...s.repos, [path]: info },
              errors: restErr,
              loading: restLoad,
            };
          });
        } catch (e) {
          set((s) => ({
            errors: { ...s.errors, [path]: String(e) },
            loading: { ...s.loading, [path]: false },
          }));
        }
      },

      async reloadAll() {
        const { paths, reload } = get();
        await Promise.all(paths.map((p) => reload(p)));
      },
    }),
    {
      name: "gitit-repo",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        paths: state.paths,
        activePath: state.activePath,
      }),
    },
  ),
);

export function repoLabel(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}
