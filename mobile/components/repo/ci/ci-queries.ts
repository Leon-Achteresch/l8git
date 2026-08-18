import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import {
  ciState,
  isCiActive,
  type RepoCommitChecks,
  type WorkflowJob,
  type WorkflowRun,
} from '~/components/repo/ci/ci-types';
import { useRepoMutation, type RepoScope } from '~/components/repo/git-queries';
import { hostQueryKey } from '~/lib/query';

export const CI_DOMAIN = 'ci';

const ACTIVE_POLL_MS = 15_000;

function anyActive(
  entries: readonly { status: string; conclusion: string | null }[] | undefined
): boolean {
  return (entries ?? []).some((entry) => isCiActive(ciState(entry.status, entry.conclusion)));
}

export function useWorkflowRuns(scope: RepoScope, supported: boolean) {
  const { hostId, repoPath, invoke, enabled } = scope;
  return useQuery({
    queryKey: hostQueryKey(hostId, repoPath, CI_DOMAIN, 'runs'),
    enabled: enabled && supported,
    staleTime: 20_000,
    refetchInterval: (query) => (anyActive(query.state.data) ? ACTIVE_POLL_MS : false),
    queryFn: () => invoke<WorkflowRun[]>('list_workflow_runs', { path: repoPath }),
  });
}

export function useWorkflowRun(scope: RepoScope, runId: number, supported: boolean) {
  const runs = useWorkflowRuns(scope, supported);
  const run = React.useMemo(
    () => (runs.data ?? []).find((entry) => entry.id === runId) ?? null,
    [runId, runs.data]
  );
  return { run, query: runs };
}

export function useWorkflowJobs(scope: RepoScope, runId: number, supported: boolean) {
  const { hostId, repoPath, invoke, enabled } = scope;
  return useQuery({
    queryKey: hostQueryKey(hostId, repoPath, CI_DOMAIN, 'run', runId, 'jobs'),
    enabled: enabled && supported && Number.isFinite(runId) && runId > 0,
    staleTime: 10_000,
    refetchInterval: (query) => (anyActive(query.state.data) ? ACTIVE_POLL_MS : false),
    queryFn: () => invoke<WorkflowJob[]>('get_workflow_jobs', { path: repoPath, runId }),
  });
}

export function useRepoCommitChecks(scope: RepoScope) {
  const { hostId, repoPath, invoke, enabled } = scope;
  return useQuery({
    queryKey: hostQueryKey(hostId, repoPath, CI_DOMAIN, 'commit-checks'),
    enabled,
    staleTime: 20_000,
    queryFn: () => invoke<RepoCommitChecks>('repo_commit_checks', { path: repoPath }),
  });
}

export function useRerunWorkflowMutation(scope: RepoScope) {
  const { repoPath } = scope;
  return useRepoMutation<number, void>(scope, (invoke, runId) =>
    invoke<void>('rerun_workflow', { path: repoPath, runId })
  );
}

export function useCancelWorkflowMutation(scope: RepoScope) {
  const { repoPath } = scope;
  return useRepoMutation<number, void>(scope, (invoke, runId) =>
    invoke<void>('cancel_workflow', { path: repoPath, runId })
  );
}

export function useCiRefresh(scope: RepoScope): () => void {
  const { hostId, repoPath } = scope;
  const queryClient = useQueryClient();
  return React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: hostQueryKey(hostId, repoPath, CI_DOMAIN) });
  }, [hostId, queryClient, repoPath]);
}
