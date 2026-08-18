import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import * as React from 'react';

import type {
  BranchActivity,
  Commit,
  CommitSearchHit,
  FileDiffPayload,
  InspectPayload,
  RepoInfo,
  StashEntry,
  UpstreamSyncCounts,
} from '~/components/repo/git-types';
import { useHostRuntime } from '~/lib/connections';
import { hostQueryKey, hostScopeKey, useHostInvoke, type HostInvoke } from '~/lib/query';

export const LOG_PAGE_SIZE = 40;
export const SEARCH_PAGE_SIZE = 40;
export const SEARCH_MIN_CHARS = 2;
export const HIDE_T3_CHECKPOINTS = true;

export type RepoScope = {
  hostId: string;
  repoPath: string;
  online: boolean;
  enabled: boolean;
  invoke: HostInvoke;
};

export function useRepoScope(hostId: string, repoPath: string): RepoScope {
  const invoke = useHostInvoke(hostId);
  const runtime = useHostRuntime(hostId);
  const online = runtime.status === 'online';
  return React.useMemo(
    () => ({
      hostId,
      repoPath,
      online,
      enabled: online && hostId.length > 0 && repoPath.length > 0,
      invoke,
    }),
    [hostId, invoke, online, repoPath]
  );
}

export function useCommitLog(scope: RepoScope) {
  const { hostId, repoPath, invoke, enabled } = scope;
  return useInfiniteQuery({
    queryKey: hostQueryKey(hostId, repoPath, 'history', 'log'),
    enabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      invoke<Commit[]>('repo_log_page', {
        path: repoPath,
        skip: pageParam,
        limit: LOG_PAGE_SIZE,
        hideT3Checkpoints: HIDE_T3_CHECKPOINTS,
      }),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < LOG_PAGE_SIZE
        ? undefined
        : allPages.reduce((total, page) => total + page.length, 0),
  });
}

export function useCommitSearch(scope: RepoScope, query: string) {
  const { hostId, repoPath, invoke, enabled } = scope;
  const needle = query.trim();
  return useInfiniteQuery({
    queryKey: hostQueryKey(hostId, repoPath, 'history', 'search', needle),
    enabled: enabled && needle.length >= SEARCH_MIN_CHARS,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      invoke<CommitSearchHit[]>('repo_search_commits', {
        path: repoPath,
        query: needle,
        skip: pageParam,
        limit: SEARCH_PAGE_SIZE,
        hideT3Checkpoints: HIDE_T3_CHECKPOINTS,
        searchPaths: null,
        scanLimit: null,
      }),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < SEARCH_PAGE_SIZE
        ? undefined
        : allPages.reduce((total, page) => total + page.length, 0),
  });
}

export function useCommitInspect(scope: RepoScope, commit: string) {
  const { hostId, repoPath, invoke, enabled } = scope;
  return useQuery({
    queryKey: hostQueryKey(hostId, repoPath, 'commit', commit, 'inspect'),
    enabled: enabled && commit.length > 0,
    queryFn: () => invoke<InspectPayload>('repo_commit_inspect', { path: repoPath, commit }),
  });
}

export function useCommitFileDiff(scope: RepoScope, commit: string, file: string | null) {
  const { hostId, repoPath, invoke, enabled } = scope;
  return useQuery({
    queryKey: hostQueryKey(hostId, repoPath, 'commit', commit, 'diff', file ?? ''),
    enabled: enabled && commit.length > 0 && Boolean(file),
    staleTime: 5 * 60_000,
    queryFn: () =>
      invoke<FileDiffPayload>('repo_commit_file_diff', {
        path: repoPath,
        commit,
        file: file ?? '',
      }),
  });
}

export function useRepoOverview(scope: RepoScope) {
  const { hostId, repoPath, invoke, enabled } = scope;
  return useQuery({
    queryKey: hostQueryKey(hostId, repoPath, 'overview'),
    enabled,
    queryFn: () =>
      invoke<RepoInfo>('open_repo', {
        path: repoPath,
        hideT3Checkpoints: HIDE_T3_CHECKPOINTS,
      }),
  });
}

export function useBranchActivity(scope: RepoScope) {
  const { hostId, repoPath, invoke, enabled } = scope;
  return useQuery({
    queryKey: hostQueryKey(hostId, repoPath, 'branches', 'activity'),
    enabled,
    staleTime: 60_000,
    queryFn: () => invoke<BranchActivity[]>('repo_branch_activity', { path: repoPath }),
  });
}

export function useUpstreamSync(scope: RepoScope) {
  const { hostId, repoPath, invoke, enabled } = scope;
  return useQuery({
    queryKey: hostQueryKey(hostId, repoPath, 'branches', 'upstream'),
    enabled,
    queryFn: () => invoke<UpstreamSyncCounts>('repo_upstream_sync_counts', { path: repoPath }),
  });
}

export function useStashes(scope: RepoScope) {
  const { hostId, repoPath, invoke, enabled } = scope;
  return useQuery({
    queryKey: hostQueryKey(hostId, repoPath, 'stash', 'list'),
    enabled,
    queryFn: () => invoke<StashEntry[]>('list_stashes', { path: repoPath }),
  });
}

export function useStashInspect(scope: RepoScope, index: number) {
  const { hostId, repoPath, invoke, enabled } = scope;
  return useQuery({
    queryKey: hostQueryKey(hostId, repoPath, 'stash', index, 'inspect'),
    enabled: enabled && Number.isFinite(index) && index >= 0,
    queryFn: () => invoke<InspectPayload>('git_stash_show', { path: repoPath, index }),
  });
}

export function useStashFileDiff(scope: RepoScope, index: number, file: string | null) {
  const { hostId, repoPath, invoke, enabled } = scope;
  return useQuery({
    queryKey: hostQueryKey(hostId, repoPath, 'stash', index, 'diff', file ?? ''),
    enabled: enabled && Number.isFinite(index) && index >= 0 && Boolean(file),
    staleTime: 5 * 60_000,
    queryFn: () =>
      invoke<FileDiffPayload>('git_stash_file_diff', {
        path: repoPath,
        index,
        file: file ?? '',
      }),
  });
}

export function useRepoMutation<TVars, TData>(
  scope: RepoScope,
  run: (invoke: HostInvoke, vars: TVars) => Promise<TData>
): UseMutationResult<TData, Error, TVars> {
  const { hostId, repoPath, invoke } = scope;
  const queryClient = useQueryClient();
  return useMutation<TData, Error, TVars>({
    mutationFn: (vars) => run(invoke, vars),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: hostScopeKey(hostId, repoPath) });
    },
  });
}

export function useRepoRefresh(scope: RepoScope): () => void {
  const { hostId, repoPath } = scope;
  const queryClient = useQueryClient();
  return React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: hostScopeKey(hostId, repoPath) });
  }, [hostId, queryClient, repoPath]);
}
