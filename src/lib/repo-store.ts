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
  body: string;
  parents: string[];
  tags: string[];
};

export type Branch = {
  name: string;
  is_current: boolean;
  is_remote: boolean;
  tip: string;
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

export type MergeStrategy = "ff" | "ff-only" | "no-ff" | "squash";

export type StashEntry = {
  index: number;
  refname: string;
  branch: string;
  subject: string;
  date: string;
  hash: string;
  message: string;
};

type RepoState = {
  paths: string[];
  activePath: string | null;
  repos: Record<string, RepoInfo>;
  favicons: Record<string, string | null>;
  loading: Record<string, boolean>;
  status: Record<string, StatusEntry[]>;
  upstreamSync: Record<string, UpstreamSyncCounts>;
  hasUpstream: Record<string, boolean>;
  statusLoading: Record<string, boolean>;
  stashes: Record<string, StashEntry[]>;
  stashesLoading: Record<string, boolean>;
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
  mergeBranch: (
    path: string,
    branch: string,
    opts?: { strategy?: MergeStrategy; message?: string },
  ) => Promise<string>;
  revertCommit: (
    path: string,
    commit: string,
    isMerge: boolean,
  ) => Promise<string>;
  tagCommit: (path: string, name: string, commit: string) => Promise<void>;
  discardFiles: (path: string, files: string[]) => Promise<void>;
  reloadStashes: (path: string) => Promise<void>;
  stashPush: (
    path: string,
    message: string | undefined,
    opts?: { includeUntracked?: boolean; keepIndex?: boolean },
  ) => Promise<string>;
  stashPop: (path: string, index: number) => Promise<string>;
  stashApply: (path: string, index: number) => Promise<string>;
  stashDrop: (path: string, index: number) => Promise<void>;
  stashBranch: (path: string, index: number, name: string) => Promise<string>;
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
      hasUpstream: {},
      statusLoading: {},
      stashes: {},
      stashesLoading: {},

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
          await get().reloadStashes(info.path);
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
          const { [path]: _st, ...stashes } = s.stashes;
          const { [path]: _stl, ...stashesLoading } = s.stashesLoading;
          const { [path]: _hu, ...hasUpstream } = s.hasUpstream;
          const activePath =
            s.activePath === path ? (paths[0] ?? null) : s.activePath;
          return {
            paths,
            repos,
            favicons,
            loading,
            activePath,
            stashes,
            stashesLoading,
            hasUpstream,
          };
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
          await get().reloadStashes(path);
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
          const [entries, sync, upstream] = await Promise.all([
            invoke<StatusEntry[]>("repo_status", { path }),
            invoke<UpstreamSyncCounts>("repo_upstream_sync_counts", { path }),
            invoke<boolean>("branch_has_upstream", { path }),
          ]);
          set((s) => ({
            status: { ...s.status, [path]: entries },
            upstreamSync: { ...s.upstreamSync, [path]: sync },
            hasUpstream: { ...s.hasUpstream, [path]: upstream },
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
        await Promise.all([
          get().reload(path),
          get().reloadStatus(path),
          get().reloadStashes(path),
        ]);
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

      async mergeBranch(path, branch, opts) {
        const out = await invoke<string>("git_merge", {
          path,
          branch,
          strategy: opts?.strategy ?? "ff",
          message: opts?.message ?? null,
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

      async reloadStashes(path) {
        set((s) => ({
          stashesLoading: { ...s.stashesLoading, [path]: true },
        }));
        try {
          const list = await invoke<StashEntry[]>("list_stashes", { path });
          set((s) => ({
            stashes: { ...s.stashes, [path]: list },
            stashesLoading: { ...s.stashesLoading, [path]: false },
          }));
        } catch (e) {
          const msg = String(e);
          toastError(msg);
          set((s) => ({
            stashesLoading: { ...s.stashesLoading, [path]: false },
          }));
        }
      },

      async stashPush(path, message, opts) {
        const out = await invoke<string>("git_stash_push", {
          path,
          message: message?.trim() ? message.trim() : null,
          includeUntracked: opts?.includeUntracked ?? false,
          keepIndex: opts?.keepIndex ?? false,
        });
        await Promise.all([
          get().reload(path),
          get().reloadStatus(path),
          get().reloadStashes(path),
        ]);
        return out.trim();
      },

      async stashPop(path, index) {
        const out = await invoke<string>("git_stash_pop", { path, index });
        await Promise.all([
          get().reload(path),
          get().reloadStatus(path),
          get().reloadStashes(path),
        ]);
        return out.trim();
      },

      async stashApply(path, index) {
        const out = await invoke<string>("git_stash_apply", { path, index });
        await Promise.all([
          get().reload(path),
          get().reloadStatus(path),
          get().reloadStashes(path),
        ]);
        return out.trim();
      },

      async stashDrop(path, index) {
        await invoke("git_stash_drop", { path, index });
        await Promise.all([
          get().reload(path),
          get().reloadStatus(path),
          get().reloadStashes(path),
        ]);
      },

      async stashBranch(path, index, name) {
        const out = await invoke<string>("git_stash_branch", {
          path,
          index,
          name,
        });
        await Promise.all([
          get().reload(path),
          get().reloadStatus(path),
          get().reloadStashes(path),
        ]);
        return out.trim();
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
