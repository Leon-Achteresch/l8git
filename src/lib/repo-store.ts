import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type Commit = {
  hash: string;
  short_hash: string;
  author: string;
  email: string;
  date: string;
  subject: string;
  parents: string[];
};

export type Branch = {
  name: string;
  is_current: boolean;
  is_remote: boolean;
};

export type RepoInfo = {
  path: string;
  branch: string;
  commits: Commit[];
  branches: Branch[];
};

export type StatusEntry = {
  path: string;
  index_status: string;
  worktree_status: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  additions_staged: number;
  deletions_staged: number;
  additions_unstaged: number;
  deletions_unstaged: number;
  binary: boolean;
};

type RepoState = {
  paths: string[];
  activePath: string | null;
  repos: Record<string, RepoInfo>;
  favicons: Record<string, string | null>;
  loading: Record<string, boolean>;
  errors: Record<string, string>;
  status: Record<string, StatusEntry[]>;
  statusLoading: Record<string, boolean>;
  addRepo: (path: string) => Promise<void>;
  removeRepo: (path: string) => void;
  setActive: (path: string) => void;
  reload: (path: string) => Promise<void>;
  reloadAll: () => Promise<void>;
  deleteBranch: (path: string, name: string, force?: boolean) => Promise<void>;
  reloadStatus: (path: string) => Promise<void>;
  stageFiles: (path: string, files: string[]) => Promise<void>;
  unstageFiles: (path: string, files: string[]) => Promise<void>;
  commitChanges: (path: string, message: string) => Promise<void>;
};

async function loadFavicon(path: string): Promise<string | null> {
  try {
    const icon = await invoke<string | null>("read_repo_favicon", { path });
    return icon ?? null;
  } catch {
    return null;
  }
}

export const useRepoStore = create<RepoState>()(
  persist(
    (set, get) => ({
      paths: [],
      activePath: null,
      repos: {},
      favicons: {},
      loading: {},
      errors: {},
      status: {},
      statusLoading: {},

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
          void loadFavicon(info.path).then((icon) => {
            set((s) => ({ favicons: { ...s.favicons, [info.path]: icon } }));
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
          const { [path]: _f, ...favicons } = s.favicons;
          const activePath =
            s.activePath === path ? (paths[0] ?? null) : s.activePath;
          return { paths, repos, favicons, errors, loading, activePath };
        });
      },

      setActive(path) {
        set({ activePath: path });
        void get().reload(path);
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
          if (!(path in get().favicons)) {
            void loadFavicon(path).then((icon) => {
              set((s) => ({ favicons: { ...s.favicons, [path]: icon } }));
            });
          }
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

      async deleteBranch(path, name, force = false) {
        await invoke("delete_branch", { path, name, force });
        await get().reload(path);
      },

      async reloadStatus(path) {
        set((s) => ({ statusLoading: { ...s.statusLoading, [path]: true } }));
        try {
          const entries = await invoke<StatusEntry[]>("repo_status", { path });
          set((s) => ({
            status: { ...s.status, [path]: entries },
            statusLoading: { ...s.statusLoading, [path]: false },
          }));
        } catch (e) {
          set((s) => ({
            errors: { ...s.errors, [path]: String(e) },
            statusLoading: { ...s.statusLoading, [path]: false },
          }));
        }
      },

      async stageFiles(path, files) {
        await invoke("stage_files", { path, files });
        await get().reloadStatus(path);
      },

      async unstageFiles(path, files) {
        await invoke("unstage_files", { path, files });
        await get().reloadStatus(path);
      },

      async commitChanges(path, message) {
        await invoke("commit_changes", { path, message });
        await Promise.all([get().reload(path), get().reloadStatus(path)]);
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
