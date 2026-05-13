import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { toastError } from '@/lib/error-toast';
import { useWorkspacePrefs } from '@/lib/workspace-prefs';

// Coalesce concurrent reload() calls per path so that back-to-back operations
// (e.g. commit + reloadStatus + reloadStashes running in parallel) share the
// same in-flight request instead of triggering N identical 200-commit
// round-trips. A small trailing debounce swallows rapid follow-ups.
const reloadInFlight = new Map<string, Promise<void>>();
const reloadPending = new Map<string, number>();
const statusInFlight = new Map<string, Promise<void>>();
const statusPending = new Map<string, number>();
const localStatusInFlight = new Map<string, Promise<void>>();
const localStatusPending = new Map<string, number>();
const stashesInFlight = new Map<string, Promise<void>>();
const stashesPending = new Map<string, number>();
const loadMoreInFlight = new Map<string, boolean>();
const loadMoreSearchInFlight = new Map<string, boolean>();
const RELOAD_COALESCE_MS = 150;

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
  author_avatar?: string | null;
};

export type CommitSearchHit = {
  commit: Commit;
  matched_paths: string[];
};

export type CommitSearchSlice = {
  query: string;
  hits: CommitSearchHit[];
  loading: boolean;
  exhausted: boolean;
  epoch: number;
};

export type Branch = {
  name: string;
  is_current: boolean;
  is_remote: boolean;
  tip: string;
};

export type TagRef = {
  name: string;
  commit: string;
};

export type RepoInfo = {
  path: string;
  branch: string;
  commits: Commit[];
  branches: Branch[];
  tags: TagRef[];
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

export type MergeStrategy = 'ff' | 'ff-only' | 'no-ff' | 'squash';

export type CherryPickState = {
  in_progress: boolean;
  head: string | null;
  conflicted_paths: string[];
};

export type MergeState = {
  in_progress: boolean;
  merge_head: string | null;
  conflicted_paths: string[];
};

export type ConflictVersions = {
  base: string;
  ours: string;
  theirs: string;
  current: string;
};

export type StashEntry = {
  index: number;
  refname: string;
  branch: string;
  subject: string;
  date: string;
  hash: string;
  message: string;
};

export type PrReviewer = {
  login: string;
  avatar: string | null;
};

export type PullRequest = {
  number: number;
  title: string;
  state: string;
  is_draft: boolean;
  author: string;
  author_avatar: string | null;
  source_branch: string;
  target_branch: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  labels: string[];
  reviewers: PrReviewer[];
  provider: string;
};

export type SubmoduleStatus =
  | 'initialized'
  | 'modified'
  | 'uninitialized'
  | 'conflict';

export type SubmoduleEntry = {
  name: string;
  path: string;
  url: string;
  commit: string;
  status: SubmoduleStatus;
  description: string | null;
  branch: string | null;
  remote_commit: string | null;
  behind_count: number | null;
  local_changes: number | null;
  is_detached: boolean;
  gitmodules_raw: string;
};

export type SubmoduleCommit = {
  hash: string;
  short_hash: string;
  message: string;
  author: string;
  date: string;
  is_pinned: boolean;
};

export type WorktreeEntry = {
  path: string;
  head: string;
  branch: string | null;
  is_main: boolean;
  is_locked: boolean;
  lock_reason: string | null;
  is_prunable: boolean;
  prunable_reason: string | null;
};

export type GitHookEntry = {
  name: string;
  exists: boolean;
  is_enabled: boolean;
  content_size: number;
};

export type BisectStatus = {
  active: boolean;
  done: boolean;
  current_hash: string | null;
  current_subject: string | null;
  steps_remaining: number | null;
  log: string;
  result_hash: string | null;
  result_subject: string | null;
  marked_bad: string[];
  marked_good: string[];
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
  prs: Record<string, PullRequest[]>;
  prsLoading: Record<string, boolean>;
  cherryPickState: Record<string, CherryPickState>;
  mergeState: Record<string, MergeState>;
  submodules: Record<string, SubmoduleEntry[]>;
  submodulesLoading: Record<string, boolean>;
  worktrees: Record<string, WorktreeEntry[]>;
  worktreesLoading: Record<string, boolean>;
  gitHooks: Record<string, GitHookEntry[]>;
  gitHooksLoading: Record<string, boolean>;
  reloadGitHooks: (path: string) => Promise<void>;
  bisect: Record<string, BisectStatus>;
  reloadBisect: (path: string) => Promise<void>;
  gitReset: (path: string, target: string, mode: 'soft' | 'mixed' | 'hard') => Promise<string>;
  bisectStart: (path: string, bad: string, good: string) => Promise<void>;
  bisectMark: (path: string, verdict: 'good' | 'bad' | 'skip') => Promise<void>;
  bisectReset: (path: string) => Promise<void>;
  saveGitHook: (path: string, hookName: string, content: string) => Promise<void>;
  deleteGitHook: (path: string, hookName: string) => Promise<void>;
  toggleGitHook: (path: string, hookName: string, enabled: boolean) => Promise<void>;
  getGitHookContent: (path: string, hookName: string) => Promise<string>;
  loadPRs: (path: string) => Promise<void>;
  addRepo: (path: string) => Promise<string | null>;
  removeRepo: (path: string) => void;
  reorderRepos: (fromIndex: number, toIndex: number) => void;
  setActive: (path: string) => void;
  reload: (path: string) => Promise<void>;
  refreshOpenRepo: (path: string) => Promise<void>;
  reloadAll: () => Promise<void>;
  deleteBranch: (path: string, name: string, force?: boolean) => Promise<void>;
  deleteRemoteBranch: (path: string, remoteRef: string) => Promise<string>;
  deleteTag: (path: string, name: string) => Promise<void>;
  deleteRemoteTag: (
    path: string,
    name: string,
    remote: string
  ) => Promise<string>;
  reloadStatus: (path: string) => Promise<void>;
  reloadLocalStatus: (path: string) => Promise<void>;
  stageFiles: (path: string, files: string[]) => Promise<void>;
  unstageFiles: (path: string, files: string[]) => Promise<void>;
  commitChanges: (path: string, message: string) => Promise<void>;
  amendCommit: (path: string, message: string) => Promise<void>;
  cloneRepo: (url: string, dest: string) => Promise<string>;
  initRepo: (path: string) => Promise<string | null>;
  checkoutBranch: (
    path: string,
    refName: string,
    opts?: {
      create?: boolean;
      fromRemote?: string;
      base?: string | null;
    }
  ) => Promise<void>;
  createBranch: (
    path: string,
    name: string,
    base?: string,
    checkout?: boolean
  ) => Promise<void>;
  mergeBranch: (
    path: string,
    branch: string,
    opts?: { strategy?: MergeStrategy; message?: string }
  ) => Promise<string>;
  revertCommit: (
    path: string,
    commit: string,
    isMerge: boolean
  ) => Promise<string>;
  cherryPick: (
    path: string,
    commits: string[],
    opts?: { mainline?: number }
  ) => Promise<string>;
  cherryPickContinue: (path: string) => Promise<string>;
  cherryPickSkip: (path: string) => Promise<string>;
  cherryPickAbort: (path: string) => Promise<string>;
  reloadCherryPickState: (path: string) => Promise<CherryPickState>;
  reloadMergeState: (path: string) => Promise<MergeState>;
  mergeAbort: (path: string) => Promise<string>;
  mergeCommit: (path: string) => Promise<string>;
  mergeGetConflictVersions: (path: string, file: string) => Promise<ConflictVersions>;
  mergeSaveResolved: (path: string, file: string, content: string) => Promise<void>;
  tagCommit: (path: string, name: string, commit: string) => Promise<void>;
  discardFiles: (path: string, files: string[]) => Promise<void>;
  restoreFilesAtCommit: (
    path: string,
    commit: string,
    files: string[]
  ) => Promise<void>;
  reloadStashes: (path: string) => Promise<void>;
  loadMoreCommits: (path: string, count?: number) => Promise<number>;
  commitSearchByPath: Record<string, CommitSearchSlice>;
  clearCommitSearch: (path: string) => void;
  searchCommits: (path: string, query: string) => Promise<void>;
  loadMoreSearchCommits: (path: string, count?: number) => Promise<number>;
  stashPush: (
    path: string,
    message: string | undefined,
    opts?: { includeUntracked?: boolean; keepIndex?: boolean }
  ) => Promise<string>;
  stashPop: (path: string, index: number) => Promise<string>;
  stashApply: (path: string, index: number) => Promise<string>;
  stashDrop: (path: string, index: number) => Promise<void>;
  stashBranch: (path: string, index: number, name: string) => Promise<string>;
  reloadSubmodules: (path: string) => Promise<void>;
  submoduleInit: (path: string, submodulePath?: string) => Promise<string>;
  submoduleUpdate: (
    path: string,
    submodulePath?: string,
    init?: boolean,
    recursive?: boolean
  ) => Promise<string>;
  submoduleSync: (path: string, submodulePath?: string) => Promise<string>;
  submoduleAdd: (
    path: string,
    url: string,
    subpath: string,
    name?: string,
    branch?: string
  ) => Promise<string>;
  submoduleDeinit: (
    path: string,
    submodulePath: string,
    force?: boolean
  ) => Promise<string>;
  getSubmoduleCommits: (
    path: string,
    submodulePath: string,
    pinnedCommit: string
  ) => Promise<SubmoduleCommit[]>;
  reloadWorktrees: (path: string) => Promise<void>;
  worktreeAdd: (
    path: string,
    worktreePath: string,
    opts?: { branch?: string; newBranch?: string }
  ) => Promise<string>;
  worktreeRemove: (
    path: string,
    worktreePath: string,
    force?: boolean
  ) => Promise<void>;
  worktreeLock: (
    path: string,
    worktreePath: string,
    reason?: string
  ) => Promise<void>;
  worktreeUnlock: (path: string, worktreePath: string) => Promise<void>;
  worktreePrune: (path: string) => Promise<string>;
  worktreeMove: (
    path: string,
    worktreePath: string,
    newPath: string
  ) => Promise<void>;
};

async function loadFavicon(path: string): Promise<string | null> {
  try {
    const icon = await invoke<string | null>('read_repo_favicon', { path });
    return icon ?? null;
  } catch {
    return null;
  }
}

type CommitAvatarEntry = { hash: string; author_avatar: string | null };

const commitAvatarGeneration = new Map<string, number>();

function nextCommitAvatarGeneration(repoPath: string): number {
  const n = (commitAvatarGeneration.get(repoPath) ?? 0) + 1;
  commitAvatarGeneration.set(repoPath, n);
  return n;
}

async function mergeRemoteCommitAvatars(
  path: string,
  commits: Commit[]
): Promise<Commit[]> {
  if (commits.length === 0) return commits;
  const hashes = commits.map(c => c.hash);
  try {
    const entries = await invoke<CommitAvatarEntry[]>(
      'resolve_repo_commit_avatars',
      { path, hashes }
    );
    const map = new Map(
      entries.map(e => [e.hash, e.author_avatar ?? null] as const)
    );
    return commits.map(c => ({
      ...c,
      author_avatar: map.get(c.hash) ?? c.author_avatar ?? null,
    }));
  } catch {
    return commits;
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
      prs: {},
      prsLoading: {},
      cherryPickState: {},
      mergeState: {},
      submodules: {},
      submodulesLoading: {},
      worktrees: {},
      worktreesLoading: {},
      gitHooks: {},
      gitHooksLoading: {},
      bisect: {},
      commitSearchByPath: {},

      clearCommitSearch(path) {
        set(s => {
          const { [path]: _removed, ...rest } = s.commitSearchByPath;
          return { commitSearchByPath: rest };
        });
      },

      async searchCommits(path, query) {
        const q = query.trim();
        if (!q) {
          get().clearCommitSearch(path);
          return;
        }
        let epochForRequest = 0;
        set(s => {
          const prev = s.commitSearchByPath[path];
          epochForRequest = (prev?.epoch ?? 0) + 1;
          return {
            commitSearchByPath: {
              ...s.commitSearchByPath,
              [path]: {
                query: q,
                hits: [],
                loading: true,
                exhausted: false,
                epoch: epochForRequest,
              },
            },
          };
        });
        try {
          const hits = await invoke<CommitSearchHit[]>('repo_search_commits', {
            path,
            query: q,
            skip: 0,
            limit: 80,
            hideT3Checkpoints: useWorkspacePrefs.getState().hideT3Checkpoints,
          });
          set(s => {
            const cur = s.commitSearchByPath[path];
            if (!cur || cur.epoch !== epochForRequest) return s;
            return {
              commitSearchByPath: {
                ...s.commitSearchByPath,
                [path]: {
                  ...cur,
                  hits,
                  loading: false,
                  exhausted: hits.length < 80,
                },
              },
            };
          });
          if (get().commitSearchByPath[path]?.epoch === epochForRequest) {
            scheduleRemoteCommitAvatars(
              path,
              hits.map(h => h.commit)
            );
          }
        } catch (e) {
          const msg = String(e);
          toastError(msg);
          set(s => {
            const cur = s.commitSearchByPath[path];
            if (!cur || cur.epoch !== epochForRequest) return s;
            return {
              commitSearchByPath: {
                ...s.commitSearchByPath,
                [path]: {
                  ...cur,
                  hits: [],
                  loading: false,
                  exhausted: true,
                },
              },
            };
          });
        }
      },

      async loadMoreSearchCommits(path, count = 80) {
        const slice = get().commitSearchByPath[path];
        const q = slice?.query?.trim() ?? '';
        if (!q || slice.loading || slice.exhausted) return 0;
        if (loadMoreSearchInFlight.get(path)) return 0;
        loadMoreSearchInFlight.set(path, true);
        const skip = slice.hits.length;
        const startEpoch = slice.epoch;
        set(s => {
          const cur = s.commitSearchByPath[path];
          if (!cur) return s;
          return {
            commitSearchByPath: {
              ...s.commitSearchByPath,
              [path]: { ...cur, loading: true },
            },
          };
        });
        try {
          const more = await invoke<CommitSearchHit[]>('repo_search_commits', {
            path,
            query: q,
            skip,
            limit: count,
            hideT3Checkpoints: useWorkspacePrefs.getState().hideT3Checkpoints,
          });
          if (more.length === 0) {
            set(s => {
              const cur = s.commitSearchByPath[path];
              if (!cur || cur.epoch !== startEpoch) return s;
              return {
                commitSearchByPath: {
                  ...s.commitSearchByPath,
                  [path]: { ...cur, loading: false, exhausted: true },
                },
              };
            });
            return 0;
          }
          let applied = false;
          set(s => {
            const cur = s.commitSearchByPath[path];
            if (!cur || cur.epoch !== startEpoch) return s;
            applied = true;
            const known = new Set(cur.hits.map(h => h.commit.hash));
            const appended = more.filter(h => !known.has(h.commit.hash));
            const hits = [...cur.hits, ...appended];
            return {
              commitSearchByPath: {
                ...s.commitSearchByPath,
                [path]: {
                  ...cur,
                  hits,
                  loading: false,
                  exhausted: more.length < count,
                },
              },
            };
          });
          if (applied && get().commitSearchByPath[path]?.epoch === startEpoch) {
            scheduleRemoteCommitAvatars(
              path,
              more.map(h => h.commit)
            );
          }
          return applied ? more.length : 0;
        } catch (e) {
          toastError(String(e));
          set(s => {
            const cur = s.commitSearchByPath[path];
            if (!cur || cur.epoch !== startEpoch) return s;
            return {
              commitSearchByPath: {
                ...s.commitSearchByPath,
                [path]: { ...cur, loading: false, exhausted: true },
              },
            };
          });
          return 0;
        } finally {
          loadMoreSearchInFlight.delete(path);
          set(s => {
            const cur = s.commitSearchByPath[path];
            if (!cur || cur.epoch !== startEpoch || !cur.loading) return s;
            return {
              commitSearchByPath: {
                ...s.commitSearchByPath,
                [path]: { ...cur, loading: false },
              },
            };
          });
        }
      },

      async loadPRs(path) {
        set(s => ({ prsLoading: { ...s.prsLoading, [path]: true } }));
        try {
          const list = await invoke<PullRequest[]>('pr_list', { path });
          set(s => ({
            prs: { ...s.prs, [path]: list },
            prsLoading: { ...s.prsLoading, [path]: false },
          }));
        } catch (e) {
          const msg = String(e);
          toastError(msg);
          set(s => ({ prsLoading: { ...s.prsLoading, [path]: false } }));
        }
      },

      async addRepo(path) {
        set(s => ({ loading: { ...s.loading, [path]: true } }));
        try {
          const opened = await invoke<RepoInfo>('open_repo', {
            path,
            hideT3Checkpoints: useWorkspacePrefs.getState().hideT3Checkpoints,
          });
          set(s => {
            const paths = s.paths.includes(opened.path)
              ? s.paths
              : [...s.paths, opened.path];
            const { [path]: __, ...restLoad } = s.loading;
            return {
              paths,
              activePath: opened.path,
              repos: { ...s.repos, [opened.path]: opened },
              loading: restLoad,
            };
          });
          scheduleRemoteCommitAvatars(opened.path, opened.commits);
          void loadFavicon(opened.path).then(icon => {
            set(s => ({ favicons: { ...s.favicons, [opened.path]: icon } }));
          });
          await get().reloadStashes(opened.path);
          return opened.path;
        } catch (e) {
          const msg = String(e);
          toastError(msg);
          set(s => ({
            loading: { ...s.loading, [path]: false },
          }));
          return null;
        }
      },

      removeRepo(path) {
        nextCommitAvatarGeneration(path);
        set(s => {
          const paths = s.paths.filter(p => p !== path);
          const { [path]: _r, ...repos } = s.repos;
          const { [path]: _l, ...loading } = s.loading;
          const { [path]: _f, ...favicons } = s.favicons;
          const { [path]: _st, ...stashes } = s.stashes;
          const { [path]: _stl, ...stashesLoading } = s.stashesLoading;
          const { [path]: _hu, ...hasUpstream } = s.hasUpstream;
          const { [path]: _cs, ...commitSearchByPath } = s.commitSearchByPath;
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
            commitSearchByPath,
          };
        });
      },

      reorderRepos(fromIndex, toIndex) {
        set(s => {
          if (
            fromIndex === toIndex ||
            fromIndex < 0 ||
            toIndex < 0 ||
            fromIndex >= s.paths.length ||
            toIndex >= s.paths.length
          ) {
            return s;
          }
          const paths = s.paths.slice();
          const [moved] = paths.splice(fromIndex, 1);
          paths.splice(toIndex, 0, moved);
          return { paths };
        });
      },

      setActive(path) {
        const was = get().activePath;
        if (was !== path) {
          set(s => ({
            activePath: path,
            loading: { ...s.loading, [path]: true },
          }));
        }
        void get().reload(path);
      },

      async reload(path) {
        const existing = reloadInFlight.get(path);
        if (existing) return existing;

        const pending = reloadPending.get(path);
        if (pending !== undefined) window.clearTimeout(pending);

        const promise = new Promise<void>(resolve => {
          const handle = window.setTimeout(async () => {
            reloadPending.delete(path);
            set(s => ({ loading: { ...s.loading, [path]: true } }));
            try {
              const opened = await invoke<RepoInfo>('open_repo', {
                path,
                hideT3Checkpoints: useWorkspacePrefs.getState().hideT3Checkpoints,
              });
              set(s => {
                const { [path]: __, ...restLoad } = s.loading;
                return {
                  repos: { ...s.repos, [path]: opened },
                  loading: restLoad,
                };
              });
              scheduleRemoteCommitAvatars(opened.path, opened.commits);
              if (!(path in get().favicons)) {
                void loadFavicon(path).then(icon => {
                  set(s => ({ favicons: { ...s.favicons, [path]: icon } }));
                });
              }
              await get().reloadStashes(path);
            } catch (e) {
              const msg = String(e);
              toastError(msg);
              set(s => ({
                loading: { ...s.loading, [path]: false },
              }));
            } finally {
              reloadInFlight.delete(path);
              resolve();
            }
          }, RELOAD_COALESCE_MS);
          reloadPending.set(path, handle);
        });
        reloadInFlight.set(path, promise);
        return promise;
      },

      async refreshOpenRepo(path) {
        await Promise.all([get().reload(path), get().reloadStatus(path)]);
      },

      async reloadAll() {
        const { paths, reload } = get();
        await Promise.all(paths.map(p => reload(p)));
      },

      async deleteBranch(path, name, force = false) {
        await invoke('delete_branch', { path, name, force });
        await get().reload(path);
      },

      async deleteRemoteBranch(path, remoteRef) {
        const out = await invoke<string>('delete_remote_branch', {
          path,
          remoteRef,
        });
        await get().reload(path);
        return out.trim();
      },

      async deleteTag(path, name) {
        await invoke('delete_tag', { path, name });
        await get().reload(path);
      },

      async deleteRemoteTag(path, name, remote) {
        const out = await invoke<string>('delete_remote_tag', {
          path,
          name,
          remote,
        });
        await get().reload(path);
        return out.trim();
      },

      async reloadStatus(path) {
        const existing = statusInFlight.get(path);
        if (existing) return existing;

        const pending = statusPending.get(path);
        if (pending !== undefined) window.clearTimeout(pending);

        const promise = new Promise<void>(resolve => {
          const handle = window.setTimeout(async () => {
            statusPending.delete(path);
            set(s => ({
              statusLoading: { ...s.statusLoading, [path]: true },
            }));
            try {
              const full = await invoke<{
                entries: StatusEntry[];
                upstream_sync: UpstreamSyncCounts;
                has_upstream: boolean;
              }>('repo_full_status', { path });
              set(s => ({
                status: { ...s.status, [path]: full.entries },
                upstreamSync: {
                  ...s.upstreamSync,
                  [path]: full.upstream_sync,
                },
                hasUpstream: { ...s.hasUpstream, [path]: full.has_upstream },
                statusLoading: { ...s.statusLoading, [path]: false },
              }));
            } catch (e) {
              const msg = String(e);
              toastError(msg);
              set(s => ({
                statusLoading: { ...s.statusLoading, [path]: false },
              }));
            } finally {
              statusInFlight.delete(path);
              resolve();
            }
          }, RELOAD_COALESCE_MS);
          statusPending.set(path, handle);
        });
        statusInFlight.set(path, promise);
        return promise;
      },

      async reloadLocalStatus(path) {
        const existing = localStatusInFlight.get(path);
        if (existing) return existing;

        const pending = localStatusPending.get(path);
        if (pending !== undefined) window.clearTimeout(pending);

        const promise = new Promise<void>(resolve => {
          const handle = window.setTimeout(async () => {
            localStatusPending.delete(path);
            set(s => ({
              statusLoading: { ...s.statusLoading, [path]: true },
            }));
            try {
              const entries = await invoke<StatusEntry[]>('repo_status', {
                path,
              });
              set(s => ({
                status: { ...s.status, [path]: entries },
                statusLoading: { ...s.statusLoading, [path]: false },
              }));
            } catch (e) {
              const msg = String(e);
              toastError(msg);
              set(s => ({
                statusLoading: { ...s.statusLoading, [path]: false },
              }));
            } finally {
              localStatusInFlight.delete(path);
              resolve();
            }
          }, RELOAD_COALESCE_MS);
          localStatusPending.set(path, handle);
        });
        localStatusInFlight.set(path, promise);
        return promise;
      },

      async stageFiles(path, files) {
        await invoke('stage_files', { path, files });
        await get().reloadStatus(path);
      },

      async unstageFiles(path, files) {
        await invoke('unstage_files', { path, files });
        await get().reloadStatus(path);
      },

      async commitChanges(path, message) {
        await invoke('commit_changes', { path, message });
        await Promise.all([
          get().reload(path),
          get().reloadStatus(path),
          get().reloadStashes(path),
        ]);
      },

      async amendCommit(path, message) {
        await invoke('commit_amend', { path, message });
        await Promise.all([
          get().reload(path),
          get().reloadStatus(path),
          get().reloadStashes(path),
        ]);
      },

      async cloneRepo(url, dest) {
        const out = await invoke<string>('git_clone', { url, dest });
        const opened = await get().addRepo(dest);
        if (!opened) {
          throw new Error('Geklontes Repository konnte nicht geöffnet werden.');
        }
        return out;
      },

      async initRepo(path) {
        await invoke<string>('git_init_repo', { path });
        return get().addRepo(path);
      },

      async checkoutBranch(path, refName, opts) {
        await invoke('git_checkout', {
          path,
          refName,
          create: opts?.create ?? false,
          fromRemote: opts?.fromRemote ?? null,
          base: opts?.base ?? null,
        });
        await Promise.all([get().reload(path), get().reloadStatus(path)]);
      },

      async createBranch(path, name, base, checkout = true) {
        await invoke('git_create_branch', {
          path,
          name,
          base: base ?? null,
          checkout,
        });
        await Promise.all([get().reload(path), get().reloadStatus(path)]);
      },

      async mergeBranch(path, branch, opts) {
        try {
          const out = await invoke<string>('git_merge', {
            path,
            branch,
            strategy: opts?.strategy ?? 'ff',
            message: opts?.message ?? null,
          });
          await Promise.all([get().reload(path), get().reloadStatus(path), get().reloadMergeState(path)]);
          return out;
        } catch (err) {
          await Promise.all([get().reload(path), get().reloadStatus(path), get().reloadMergeState(path)]);
          throw err;
        }
      },

      async revertCommit(path, commit, isMerge) {
        const out = await invoke<string>('git_revert_commit', {
          path,
          commit,
          mergeMainline: isMerge ? 1 : null,
        });
        await Promise.all([get().reload(path), get().reloadStatus(path)]);
        return out;
      },

      async cherryPick(path, commits, opts) {
        try {
          const out = await invoke<string>('git_cherry_pick', {
            path,
            commits,
            mainline: opts?.mainline ?? null,
          });
          await Promise.all([
            get().reload(path),
            get().reloadStatus(path),
            get().reloadCherryPickState(path),
          ]);
          return out;
        } catch (err) {
          await Promise.all([
            get().reload(path),
            get().reloadStatus(path),
            get().reloadCherryPickState(path),
          ]);
          throw err;
        }
      },

      async cherryPickContinue(path) {
        const out = await invoke<string>('git_cherry_pick_continue', { path });
        await Promise.all([
          get().reload(path),
          get().reloadStatus(path),
          get().reloadCherryPickState(path),
        ]);
        return out;
      },

      async cherryPickSkip(path) {
        const out = await invoke<string>('git_cherry_pick_skip', { path });
        await Promise.all([
          get().reload(path),
          get().reloadStatus(path),
          get().reloadCherryPickState(path),
        ]);
        return out;
      },

      async cherryPickAbort(path) {
        const out = await invoke<string>('git_cherry_pick_abort', { path });
        await Promise.all([
          get().reload(path),
          get().reloadStatus(path),
          get().reloadCherryPickState(path),
        ]);
        return out;
      },

      async reloadCherryPickState(path) {
        const apply = (next: CherryPickState): CherryPickState => {
          const cur = get().cherryPickState[path];
          if (
            cur &&
            cur.in_progress === next.in_progress &&
            cur.head === next.head &&
            cur.conflicted_paths.length === next.conflicted_paths.length &&
            cur.conflicted_paths.every((p, i) => p === next.conflicted_paths[i])
          ) {
            return cur;
          }
          set(s => ({
            cherryPickState: { ...s.cherryPickState, [path]: next },
          }));
          return next;
        };
        try {
          const next = await invoke<CherryPickState>('cherry_pick_state', {
            path,
          });
          return apply(next);
        } catch {
          return apply({
            in_progress: false,
            head: null,
            conflicted_paths: [],
          });
        }
      },

      async reloadMergeState(path) {
        const apply = (next: MergeState): MergeState => {
          const cur = get().mergeState[path];
          if (
            cur &&
            cur.in_progress === next.in_progress &&
            cur.merge_head === next.merge_head &&
            cur.conflicted_paths.length === next.conflicted_paths.length &&
            cur.conflicted_paths.every((p, i) => p === next.conflicted_paths[i])
          ) {
            return cur;
          }
          set(s => ({
            mergeState: { ...s.mergeState, [path]: next },
          }));
          return next;
        };
        try {
          const next = await invoke<MergeState>('merge_state', { path });
          return apply(next);
        } catch {
          return apply({ in_progress: false, merge_head: null, conflicted_paths: [] });
        }
      },

      async mergeAbort(path) {
        const out = await invoke<string>('git_merge_abort', { path });
        await Promise.all([
          get().reload(path),
          get().reloadStatus(path),
          get().reloadMergeState(path),
        ]);
        return out;
      },

      async mergeCommit(path) {
        const out = await invoke<string>('git_merge_commit', { path });
        await Promise.all([
          get().reload(path),
          get().reloadStatus(path),
          get().reloadMergeState(path),
        ]);
        return out;
      },

      async mergeGetConflictVersions(path, file) {
        return invoke<ConflictVersions>('git_get_conflict_versions', { path, file });
      },

      async mergeSaveResolved(path, file, content) {
        await invoke('git_save_resolved_file', { path, file, content });
        await get().reloadStatus(path);
        await get().reloadMergeState(path);
      },

      async tagCommit(path, name, commit) {
        await invoke('git_tag_commit', { path, name, commit });
        await get().reload(path);
      },

      async discardFiles(path, files) {
        const entries = get().status[path] ?? [];
        const byPath = new Map(entries.map(e => [e.path, e.untracked]));
        const untracked = files.map(f => byPath.get(f) ?? false);
        await invoke('git_discard_files', { path, files, untracked });
        await get().reloadStatus(path);
      },

      async restoreFilesAtCommit(path, commit, files) {
        await invoke('git_restore_files_at_commit', { path, commit, files });
        await get().reloadStatus(path);
      },

      async reloadStashes(path) {
        const existing = stashesInFlight.get(path);
        if (existing) return existing;

        const pending = stashesPending.get(path);
        if (pending !== undefined) window.clearTimeout(pending);

        const promise = new Promise<void>(resolve => {
          const handle = window.setTimeout(async () => {
            stashesPending.delete(path);
            set(s => ({
              stashesLoading: { ...s.stashesLoading, [path]: true },
            }));
            try {
              const list = await invoke<StashEntry[]>('list_stashes', {
                path,
              });
              set(s => ({
                stashes: { ...s.stashes, [path]: list },
                stashesLoading: { ...s.stashesLoading, [path]: false },
              }));
            } catch (e) {
              const msg = String(e);
              toastError(msg);
              set(s => ({
                stashesLoading: { ...s.stashesLoading, [path]: false },
              }));
            } finally {
              stashesInFlight.delete(path);
              resolve();
            }
          }, RELOAD_COALESCE_MS);
          stashesPending.set(path, handle);
        });
        stashesInFlight.set(path, promise);
        return promise;
      },

      async stashPush(path, message, opts) {
        const out = await invoke<string>('git_stash_push', {
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
        const out = await invoke<string>('git_stash_pop', { path, index });
        await Promise.all([
          get().reload(path),
          get().reloadStatus(path),
          get().reloadStashes(path),
        ]);
        return out.trim();
      },

      async stashApply(path, index) {
        const out = await invoke<string>('git_stash_apply', { path, index });
        await Promise.all([
          get().reload(path),
          get().reloadStatus(path),
          get().reloadStashes(path),
        ]);
        return out.trim();
      },

      async stashDrop(path, index) {
        await invoke('git_stash_drop', { path, index });
        await Promise.all([
          get().reload(path),
          get().reloadStatus(path),
          get().reloadStashes(path),
        ]);
      },

      async stashBranch(path, index, name) {
        const out = await invoke<string>('git_stash_branch', {
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

      async reloadSubmodules(path) {
        set(s => ({
          submodulesLoading: { ...s.submodulesLoading, [path]: true },
        }));
        try {
          const list = await invoke<SubmoduleEntry[]>('list_submodules', {
            path,
          });
          set(s => ({
            submodules: { ...s.submodules, [path]: list },
            submodulesLoading: { ...s.submodulesLoading, [path]: false },
          }));
        } catch (e) {
          toastError(String(e));
          set(s => ({
            submodulesLoading: { ...s.submodulesLoading, [path]: false },
          }));
        }
      },

      async submoduleInit(path, submodulePath) {
        const out = await invoke<string>('git_submodule_init', {
          path,
          submodulePath: submodulePath ?? null,
        });
        await get().reloadSubmodules(path);
        return out.trim();
      },

      async submoduleUpdate(
        path,
        submodulePath,
        init = false,
        recursive = false
      ) {
        const out = await invoke<string>('git_submodule_update', {
          path,
          submodulePath: submodulePath ?? null,
          init,
          recursive,
        });
        await get().reloadSubmodules(path);
        return out.trim();
      },

      async submoduleSync(path, submodulePath) {
        const out = await invoke<string>('git_submodule_sync', {
          path,
          submodulePath: submodulePath ?? null,
        });
        await get().reloadSubmodules(path);
        return out.trim();
      },

      async submoduleAdd(path, url, subpath, name, branch) {
        const out = await invoke<string>('git_submodule_add', {
          path,
          url,
          subpath,
          name: name ?? null,
          branch: branch ?? null,
        });
        await get().reloadSubmodules(path);
        return out.trim();
      },

      async submoduleDeinit(path, submodulePath, force = false) {
        const out = await invoke<string>('git_submodule_deinit', {
          path,
          submodulePath,
          force,
        });
        await get().reloadSubmodules(path);
        return out.trim();
      },

      async getSubmoduleCommits(path, submodulePath, pinnedCommit) {
        return await invoke<SubmoduleCommit[]>('get_submodule_commits', {
          path,
          submodulePath,
          pinnedCommit,
        });
      },

      async reloadWorktrees(path) {
        set(s => ({
          worktreesLoading: { ...s.worktreesLoading, [path]: true },
        }));
        try {
          const list = await invoke<WorktreeEntry[]>('list_worktrees', { path });
          set(s => ({
            worktrees: { ...s.worktrees, [path]: list },
            worktreesLoading: { ...s.worktreesLoading, [path]: false },
          }));
        } catch (e) {
          toastError(String(e));
          set(s => ({
            worktreesLoading: { ...s.worktreesLoading, [path]: false },
          }));
        }
      },

      async worktreeAdd(path, worktreePath, opts) {
        const out = await invoke<string>('git_worktree_add', {
          path,
          worktreePath,
          branch: opts?.branch ?? null,
          newBranch: opts?.newBranch ?? null,
        });
        await get().reloadWorktrees(path);
        return out.trim();
      },

      async worktreeRemove(path, worktreePath, force = false) {
        await invoke('git_worktree_remove', { path, worktreePath, force });
        await get().reloadWorktrees(path);
      },

      async worktreeLock(path, worktreePath, reason) {
        await invoke('git_worktree_lock', {
          path,
          worktreePath,
          reason: reason ?? null,
        });
        await get().reloadWorktrees(path);
      },

      async worktreeUnlock(path, worktreePath) {
        await invoke('git_worktree_unlock', { path, worktreePath });
        await get().reloadWorktrees(path);
      },

      async worktreePrune(path) {
        const out = await invoke<string>('git_worktree_prune', { path });
        await get().reloadWorktrees(path);
        return (out as string).trim();
      },

      async worktreeMove(path, worktreePath, newPath) {
        await invoke('git_worktree_move', { path, worktreePath, newPath });
        await get().reloadWorktrees(path);
      },

      async reloadGitHooks(path) {
        set(s => ({ gitHooksLoading: { ...s.gitHooksLoading, [path]: true } }));
        try {
          const list = await invoke<GitHookEntry[]>('list_git_hooks', { path });
          set(s => ({
            gitHooks: { ...s.gitHooks, [path]: list },
            gitHooksLoading: { ...s.gitHooksLoading, [path]: false },
          }));
        } catch (e) {
          toastError(String(e));
          set(s => ({ gitHooksLoading: { ...s.gitHooksLoading, [path]: false } }));
        }
      },

      async saveGitHook(path, hookName, content) {
        await invoke('save_git_hook', { path, hookName, content });
        await get().reloadGitHooks(path);
      },

      async deleteGitHook(path, hookName) {
        await invoke('delete_git_hook', { path, hookName });
        await get().reloadGitHooks(path);
      },

      async toggleGitHook(path, hookName, enabled) {
        await invoke('toggle_git_hook', { path, hookName, enabled });
        await get().reloadGitHooks(path);
      },

      async getGitHookContent(path, hookName) {
        return invoke<string>('get_git_hook_content', { path, hookName });
      },

      async gitReset(path, target, mode) {
        const out = await invoke<string>('git_reset', { path, target, mode });
        await Promise.all([get().reload(path), get().reloadStatus(path)]);
        return out.trim();
      },

      async reloadBisect(path) {
        try {
          const status = await invoke<BisectStatus>('git_bisect_status', { path });
          set(s => ({ bisect: { ...s.bisect, [path]: status } }));
        } catch (e) {
          toastError(String(e));
        }
      },

      async bisectStart(path, bad, good) {
        try {
          const status = await invoke<BisectStatus>('git_bisect_start', { path, bad, good });
          set(s => ({ bisect: { ...s.bisect, [path]: status } }));
          await get().reload(path);
        } catch (e) {
          toastError(String(e));
          throw e;
        }
      },

      async bisectMark(path, verdict) {
        try {
          const status = await invoke<BisectStatus>('git_bisect_mark', { path, verdict });
          set(s => ({ bisect: { ...s.bisect, [path]: status } }));
          await get().reload(path);
        } catch (e) {
          toastError(String(e));
          throw e;
        }
      },

      async bisectReset(path) {
        try {
          await invoke('git_bisect_reset', { path });
          set(s => {
            const { [path]: _removed, ...rest } = s.bisect;
            return { bisect: rest };
          });
          await get().reload(path);
        } catch (e) {
          toastError(String(e));
          throw e;
        }
      },

      async loadMoreCommits(path, count = 80) {
        const repo = get().repos[path];
        if (!repo) return 0;
        const skip = repo.commits.length;
        if (loadMoreInFlight.get(path)) return 0;
        loadMoreInFlight.set(path, true);
        try {
          const more = await invoke<Commit[]>('repo_log_page', {
            path,
            skip,
            limit: count,
            hideT3Checkpoints: useWorkspacePrefs.getState().hideT3Checkpoints,
          });
          if (more.length === 0) return 0;
          // Dedup against commits we already have (virtualiser-triggered
          // calls can occasionally race after a reload replaces the list).
          set(s => {
            const existing = s.repos[path];
            if (!existing) return s;
            const known = new Set(existing.commits.map(c => c.hash));
            const appended = more.filter(c => !known.has(c.hash));
            if (appended.length === 0) return s;
            return {
              repos: {
                ...s.repos,
                [path]: {
                  ...existing,
                  commits: [...existing.commits, ...appended],
                },
              },
            };
          });
          scheduleRemoteCommitAvatars(path, more);
          return more.length;
        } catch (e) {
          toastError(String(e));
          return 0;
        } finally {
          loadMoreInFlight.delete(path);
        }
      },
    }),
    {
      name: 'l8git-repo',
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({
        paths: state.paths,
        activePath: state.activePath,
      }),
    }
  )
);

function scheduleRemoteCommitAvatars(repoPath: string, commits: Commit[]) {
  if (commits.length === 0) return;
  const gen = nextCommitAvatarGeneration(repoPath);
  void mergeRemoteCommitAvatars(repoPath, commits).then(merged => {
    useRepoStore.setState(s => {
      if (commitAvatarGeneration.get(repoPath) !== gen) return s;
      const r = s.repos[repoPath];
      if (!r) return s;
      const newAvatars = new Map<string, string | null>(
        merged
          .filter(c => c.author_avatar != null)
          .map(c => [c.hash, c.author_avatar!] as const)
      );
      if (newAvatars.size === 0) return s;
      const updatedCommits = r.commits.map(c =>
        newAvatars.has(c.hash)
          ? { ...c, author_avatar: newAvatars.get(c.hash) }
          : c
      );
      return {
        repos: {
          ...s.repos,
          [repoPath]: { ...r, commits: updatedCommits },
        },
      };
    });
  });
}

export function repoLabel(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}
