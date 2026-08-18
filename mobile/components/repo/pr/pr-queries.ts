import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { ciState, isCiActive, type RemoteCiCheck } from '~/components/repo/ci/ci-types';
import { useRepoMutation, type RepoScope } from '~/components/repo/git-queries';
import type {
  BranchProtection,
  MergeStrategy,
  PrCheckoutResult,
  PrConversation,
  PrMergeResult,
  ProviderCapabilities,
  PullRequest,
  PullRequestDetail,
  ReviewEvent,
} from '~/components/repo/pr/pr-types';
import { hostQueryKey } from '~/lib/query';

export const PR_DOMAIN = 'pr';

export function usePrCapabilities(scope: RepoScope) {
  const { hostId, repoPath, invoke, enabled } = scope;
  return useQuery({
    queryKey: hostQueryKey(hostId, repoPath, PR_DOMAIN, 'capabilities'),
    enabled,
    staleTime: 10 * 60_000,
    retry: 0,
    queryFn: () => invoke<ProviderCapabilities>('pr_provider_capabilities', { path: repoPath }),
  });
}

export function usePrList(scope: RepoScope) {
  const { hostId, repoPath, invoke, enabled } = scope;
  return useQuery({
    queryKey: hostQueryKey(hostId, repoPath, PR_DOMAIN, 'list'),
    enabled,
    staleTime: 30_000,
    queryFn: () => invoke<PullRequest[]>('pr_list', { path: repoPath }),
  });
}

export function usePrDetail(scope: RepoScope, number: number) {
  const { hostId, repoPath, invoke, enabled } = scope;
  return useQuery({
    queryKey: hostQueryKey(hostId, repoPath, PR_DOMAIN, number, 'detail'),
    enabled: enabled && Number.isFinite(number) && number > 0,
    queryFn: () => invoke<PullRequestDetail>('pr_detail', { path: repoPath, number }),
  });
}

export function usePrConversation(scope: RepoScope, number: number) {
  const { hostId, repoPath, invoke, enabled } = scope;
  return useQuery({
    queryKey: hostQueryKey(hostId, repoPath, PR_DOMAIN, number, 'conversation'),
    enabled: enabled && Number.isFinite(number) && number > 0,
    queryFn: () => invoke<PrConversation>('pr_conversation', { path: repoPath, number }),
  });
}

export function usePrChecks(scope: RepoScope, number: number) {
  const { hostId, repoPath, invoke, enabled } = scope;
  return useQuery({
    queryKey: hostQueryKey(hostId, repoPath, PR_DOMAIN, number, 'checks'),
    enabled: enabled && Number.isFinite(number) && number > 0,
    staleTime: 15_000,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((check) =>
        isCiActive(ciState(check.status, check.conclusion))
      )
        ? 15_000
        : false,
    queryFn: () => invoke<RemoteCiCheck[]>('pr_checks', { path: repoPath, number }),
  });
}

export function useBranchProtection(scope: RepoScope, branch: string | null, active: boolean) {
  const { hostId, repoPath, invoke, enabled } = scope;
  return useQuery({
    queryKey: hostQueryKey(hostId, repoPath, PR_DOMAIN, 'protection', branch ?? ''),
    enabled: enabled && active && Boolean(branch),
    staleTime: 5 * 60_000,
    retry: 0,
    queryFn: () =>
      invoke<BranchProtection>('pr_branch_protection', { path: repoPath, branch: branch ?? '' }),
  });
}

export type CommentVars = {
  number: number;
  body: string;
};

export function usePrCommentMutation(scope: RepoScope) {
  const { repoPath } = scope;
  return useRepoMutation<CommentVars, void>(scope, (invoke, vars) =>
    invoke<void>('pr_add_comment', {
      path: repoPath,
      number: vars.number,
      body: vars.body,
      inReplyTo: null,
      filePath: null,
      line: null,
    })
  );
}

export type ReviewVars = {
  number: number;
  event: ReviewEvent;
  body: string;
};

export function usePrReviewMutation(scope: RepoScope) {
  const { repoPath } = scope;
  return useRepoMutation<ReviewVars, void>(scope, (invoke, vars) =>
    invoke<void>('pr_submit_review', {
      path: repoPath,
      number: vars.number,
      event: vars.event,
      body: vars.body,
      comments: null,
    })
  );
}

export type MergeVars = {
  number: number;
  strategy: MergeStrategy;
  message: string | null;
  deleteSourceBranch: boolean;
};

export function usePrMergeMutation(scope: RepoScope) {
  const { repoPath } = scope;
  return useRepoMutation<MergeVars, PrMergeResult>(scope, (invoke, vars) =>
    invoke<PrMergeResult>('pr_merge', {
      path: repoPath,
      number: vars.number,
      strategy: vars.strategy,
      message: vars.message,
      deleteSourceBranch: vars.deleteSourceBranch,
    })
  );
}

export type AutoMergeVars = {
  prNodeId: string;
  enable: boolean;
  mergeMethod: MergeStrategy | null;
};

export function usePrAutoMergeMutation(scope: RepoScope) {
  const { repoPath } = scope;
  return useRepoMutation<AutoMergeVars, void>(scope, (invoke, vars) =>
    invoke<void>('pr_set_auto_merge', {
      path: repoPath,
      prNodeId: vars.prNodeId,
      enable: vars.enable,
      mergeMethod: vars.enable ? vars.mergeMethod : null,
    })
  );
}

export function usePrCheckoutMutation(scope: RepoScope) {
  const { repoPath } = scope;
  return useRepoMutation<number, PrCheckoutResult>(scope, (invoke, number) =>
    invoke<PrCheckoutResult>('pr_checkout', { path: repoPath, number })
  );
}

export type RerunCheckVars = {
  checkRunId: string | null;
  suiteId: string | null;
};

export function usePrRerunCheckMutation(scope: RepoScope) {
  const { repoPath } = scope;
  return useRepoMutation<RerunCheckVars, void>(scope, (invoke, vars) => {
    if (vars.suiteId) {
      return invoke<void>('pr_rerun_check_suite', { path: repoPath, suiteId: vars.suiteId });
    }
    return invoke<void>('pr_rerun_check', {
      path: repoPath,
      checkRunId: vars.checkRunId ?? '',
    });
  });
}

export function usePrRefresh(scope: RepoScope, number?: number): () => void {
  const { hostId, repoPath } = scope;
  const queryClient = useQueryClient();
  return React.useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey:
        number === undefined
          ? hostQueryKey(hostId, repoPath, PR_DOMAIN)
          : hostQueryKey(hostId, repoPath, PR_DOMAIN, number),
    });
    if (number !== undefined) {
      void queryClient.invalidateQueries({
        queryKey: hostQueryKey(hostId, repoPath, PR_DOMAIN, 'list'),
      });
    }
  }, [hostId, number, queryClient, repoPath]);
}
