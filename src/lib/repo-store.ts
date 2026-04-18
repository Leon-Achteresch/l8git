import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { toastError } from "@/lib/error-toast";

export type Commit = {
  hash: string;
  short_hash: string;
  author: string;
  email: string;
  date: string;
  subject: string;
  parents: string[];
  tags: string[];
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

export type UpstreamSyncCounts = {
  ahead: number;
  behind: number;
};

type RepoState = {
  paths: string[];
  activePath: string | null;
  repos: Record<string, RepoInfo>;
  favicons: Record<string, string | null>;
  loading: Record<string, boolean>;
  status: Record<string, StatusEntry[]>;
  upstreamSync: Record<string, UpstreamSyncCounts>;
  statusLoading: Record<string, boolean>;
  addRepo: (path: string) => Promise<string | null>;
  removeRepo: (path: string) => void;
  setActive: (path: string) => void;
  reload: (path: string) => Promise<void>;
  reloadAll: () => Promise<void>;
  deleteBranch: (path: string, name: string, force?: boolean) => Promise<void>;
  deleteRemoteBranch: (path: string, remoteRef: string) => Promise<string>;
  reloadStatus: (path: string) => Promise<void>;
  stageFiles: (path: string, files: string[]) => Promise<void>;
  unstageFiles: (path: string, files: string[]) => Promise<void>;
  commitChanges: (path: string, message: string) => Promise<void>;
  cloneRepo: (url: string, dest: string) => Promise<string>;
  checkoutBranch: (
    path: string,
    refName: string,
    opts?: {
      create?: boolean;
      fromRemote?: string;
      base?: string | null;
    },
  ) => Promise<void>;
  createBranch: (
    path: string,
    name: string,
    base?: string,
    checkout?: boolean,
  ) => Promise<void>;
  mergeBranch: (path: string, branch: string, noFf?: boolean) => Promise<string>;
  revertCommit: (
    path: string,
    commit: string,
    isMerge: boolean,
  ) => Promise<string>;
  tagCommit: (path: string, name: string, commit: string) => Promise<void>;
  discardFiles: (path: string, files: string[]) => Promise<void>;
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
      status: {},
      upstreamSync: {},
      statusLoading: {},

      async addRepo(path) {
        set((s) => ({ loading: { ...s.loading, [path]: true } }));
        try {
          const info = await invoke<RepoInfo>("open_repo", { path });
          set((s) => {
            const paths = s.paths.includes(info.path)
              ? s.paths
              : [...s.paths, info.path];
            const { [path]: __, ...restLoad } = s.loading;
            return {
              paths,
              activePath: info.path,
              repos: { ...s.repos, [info.path]: info },
              loading: restLoad,
            };
          });
          void loadFavicon(info.path).then((icon) => {
            set((s) => ({ favicons: { ...s.favicons, [info.path]: icon } }));
          });
          return info.path;
        } catch (e) {
          const msg = String(e);
          toastError(msg);
          set((s) => ({
            loading: { ...s.loading, [path]: false },
          }));
          return null;
        }
      },

      removeRepo(path) {
        set((s) => {
          const paths = s.paths.filter((p) => p !== path);
          const { [path]: _r, ...repos } = s.repos;
          const { [path]: _l, ...loading } = s.loading;
          const { [path]: _f, ...favicons } = s.favicons;
          const activePath =
            s.activePath === path ? (paths[0] ?? null) : s.activePath;
          return { paths, repos, favicons, loading, activePath };
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
            const { [path]: __, ...restLoad } = s.loading;
            return {
              repos: { ...s.repos, [path]: info },
              loading: restLoad,
            };
          });
          if (!(path in get().favicons)) {
            void loadFavicon(path).then((icon) => {
              set((s) => ({ favicons: { ...s.favicons, [path]: icon } }));
            });
          }
        } catch (e) {
          const msg = String(e);
          toastError(msg);
          set((s) => ({
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

      async deleteRemoteBranch(path, remoteRef) {
        const out = await invoke<string>("delete_remote_branch", {
          path,
          remoteRef,
        });
        await get().reload(path);
        return out.trim();
      },

      async reloadStatus(path) {
        set((s) => ({ statusLoading: { ...s.statusLoading, [path]: true } }));
        try {
          const [entries, sync] = await Promise.all([
            invoke<StatusEntry[]>("repo_status", { path }),
            invoke<UpstreamSyncCounts>("repo_upstream_sync_counts", { path }),
          ]);
          set((s) => ({
            status: { ...s.status, [path]: entries },
            upstreamSync: { ...s.upstreamSync, [path]: sync },
            statusLoading: { ...s.statusLoading, [path]: false },
          }));
        } catch (e) {
          const msg = String(e);
          toastError(msg);
          set((s) => ({
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

      async cloneRepo(url, dest) {
        const out = await invoke<string>("git_clone", { url, dest });
        const opened = await get().addRepo(dest);
        if (!opened) {
          throw new Error("Geklontes Repository konnte nicht geöffnet werden.");
        }
        return out;
      },

      async checkoutBranch(path, refName, opts) {
        await invoke("git_checkout", {
          path,
          refName,
          create: opts?.create ?? false,
          fromRemote: opts?.fromRemote ?? null,
          base: opts?.base ?? null,
        });
        await Promise.all([get().reload(path), get().reloadStatus(path)]);
      },

      async createBranch(path, name, base, checkout = true) {
        await invoke("git_create_branch", {
          path,
          name,
          base: base ?? null,
          checkout,
        });
        await Promise.all([get().reload(path), get().reloadStatus(path)]);
      },

      async mergeBranch(path, branch, noFf = false) {
        const out = await invoke<string>("git_merge", {
          path,
          branch,
          noFf,
        });
        await Promise.all([get().reload(path), get().reloadStatus(path)]);
        return out;
      },

      async revertCommit(path, commit, isMerge) {
        const out = await invoke<string>("git_revert_commit", {
          path,
          commit,
          mergeMainline: isMerge ? 1 : null,
        });
        await Promise.all([get().reload(path), get().reloadStatus(path)]);
        return out;
      },

      async tagCommit(path, name, commit) {
        await invoke("git_tag_commit", { path, name, commit });
        await get().reload(path);
      },

      async discardFiles(path, files) {
        const entries = get().status[path] ?? [];
        const byPath = new Map(entries.map((e) => [e.path, e.untracked]));
        const untracked = files.map((f) => byPath.get(f) ?? false);
        await invoke("git_discard_files", { path, files, untracked });
        await get().reloadStatus(path);
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
