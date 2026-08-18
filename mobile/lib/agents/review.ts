import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Href } from 'expo-router';
import * as React from 'react';
import { useShallow } from 'zustand/react/shallow';

import {
  canRunStep,
  createFinishSteps,
  finishFlowStatus,
  isAgentSessionBranch,
  nextPendingStep,
  retryStep,
  setStepStatus,
  type AgentReviewFile,
  type AgentReviewFileDiff,
  type AgentReviewStep,
  type AgentReviewStepId,
  type AgentReviewSummary,
} from '@desktop/lib/agents/agent-review';

import { getClient, useConnections, useHostMeta, useOnlineHostIds } from '~/lib/connections';
import { hostQueryKey } from '~/lib/query';
import { useRepoRegistry } from '~/lib/repo/registry';

import { useChatStore, type AgentChatState } from './stores';

export type {
  AgentReviewFile,
  AgentReviewFileDiff,
  AgentReviewStep,
  AgentReviewStepId,
  AgentReviewSummary,
};

export {
  canRunStep,
  createFinishSteps,
  finishFlowStatus,
  isAgentSessionBranch,
  nextPendingStep,
  retryStep,
  setStepStatus,
};

export interface WorktreeEntry {
  path: string;
  head: string;
  branch: string | null;
  is_main: boolean;
  is_locked: boolean;
  lock_reason: string | null;
  is_prunable: boolean;
  prunable_reason: string | null;
}

export interface AgentReviewSession {
  hostId: string;
  worktreePath: string;
  basePath: string;
  branch: string | null;
}

export interface AgentWorktreeSession extends AgentReviewSession {
  hostName: string;
  repoName: string;
  name: string;
}

const REVIEW_DOMAIN = 'agent-review';

function normalizePath(path: string): string {
  const trimmed = path.trim().replace(/\\/g, '/');
  return trimmed.length > 1 ? trimmed.replace(/\/+$/, '') : trimmed;
}

function leafName(path: string): string {
  return normalizePath(path).split('/').filter(Boolean).pop() ?? path;
}

export function agentReviewHref(hostId: string, worktreePath: string): Href {
  return {
    pathname: '/agents/review',
    params: { hostId, path: worktreePath },
  } as Href;
}

export function agentReviewFileHref(
  hostId: string,
  worktreePath: string,
  mergeBase: string,
  file: string
): Href {
  return {
    pathname: '/agents/review-file',
    params: { hostId, path: worktreePath, base: mergeBase, file },
  } as Href;
}

async function hostInvoke<T>(
  hostId: string,
  cmd: string,
  args: Record<string, unknown>
): Promise<T> {
  const client = getClient(hostId);
  if (!client) {
    throw new Error(`Host ${hostId} is not connected.`);
  }
  return client.request<T>(cmd, args);
}

export function sessionFromWorktrees(
  hostId: string,
  worktreePath: string,
  entries: readonly WorktreeEntry[]
): AgentReviewSession | null {
  const target = normalizePath(worktreePath);
  const main = entries.find((entry) => entry.is_main);
  if (!main) {
    return null;
  }
  const self =
    entries.find((entry) => normalizePath(entry.path) === target) ??
    (entries.length === 2 ? entries.find((entry) => !entry.is_main) : undefined);
  if (!self || self.is_main) {
    return null;
  }
  return {
    hostId,
    worktreePath: self.path,
    basePath: main.path,
    branch: self.branch,
  };
}

export function useWorktreeList(hostId: string, path: string, enabled = true) {
  return useQuery({
    queryKey: hostQueryKey(hostId, path, REVIEW_DOMAIN, 'worktrees'),
    enabled: enabled && hostId.length > 0 && path.length > 0,
    queryFn: () => hostInvoke<WorktreeEntry[]>(hostId, 'list_worktrees', { path }),
  });
}

export function useAgentReviewSession(hostId: string, worktreePath: string) {
  const query = useWorktreeList(hostId, worktreePath);
  const session = React.useMemo(
    () => (query.data ? sessionFromWorktrees(hostId, worktreePath, query.data) : null),
    [hostId, query.data, worktreePath]
  );
  return { session, loading: query.isPending, error: query.error, refetch: query.refetch };
}

export function useAgentWorktreeSessions(): {
  sessions: AgentWorktreeSession[];
  loading: boolean;
} {
  const hostIds = useOnlineHostIds();
  const pathsByHost = useRepoRegistry(useShallow((state) => state.pathsByHost));
  const hostNames = useConnections(
    useShallow((state) => Object.fromEntries(state.hosts.map((host) => [host.hostId, host.name])))
  );

  const pairs = React.useMemo(
    () =>
      hostIds.flatMap((hostId) =>
        (pathsByHost[hostId] ?? []).map((path) => ({ hostId, path }))
      ),
    [hostIds, pathsByHost]
  );

  const results = useQueries({
    queries: pairs.map((pair) => ({
      queryKey: hostQueryKey(pair.hostId, pair.path, REVIEW_DOMAIN, 'worktrees'),
      queryFn: () =>
        hostInvoke<WorktreeEntry[]>(pair.hostId, 'list_worktrees', { path: pair.path }),
      staleTime: 30_000,
    })),
  });

  const loading = results.some((result) => result.isPending);
  const seen = new Set<string>();
  const sessions: AgentWorktreeSession[] = [];

  pairs.forEach((pair, index) => {
    const entries = results[index]?.data;
    if (!entries) {
      return;
    }
    const main = entries.find((entry) => entry.is_main);
    if (!main) {
      return;
    }
    for (const entry of entries) {
      if (entry.is_main || !isAgentSessionBranch(entry.branch)) {
        continue;
      }
      const key = `${pair.hostId}:${normalizePath(entry.path)}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      sessions.push({
        hostId: pair.hostId,
        worktreePath: entry.path,
        basePath: main.path,
        branch: entry.branch,
        hostName: hostNames[pair.hostId] ?? pair.hostId,
        repoName: leafName(main.path),
        name: leafName(entry.path),
      });
    }
  });

  sessions.sort(
    (left, right) =>
      left.repoName.localeCompare(right.repoName) || left.name.localeCompare(right.name)
  );

  return { sessions, loading };
}

export function useReviewSummary(session: AgentReviewSession | null) {
  return useQuery({
    queryKey: hostQueryKey(
      session?.hostId ?? '',
      session?.worktreePath ?? null,
      REVIEW_DOMAIN,
      'summary',
      session?.basePath ?? ''
    ),
    enabled: Boolean(session),
    queryFn: () =>
      hostInvoke<AgentReviewSummary>(session!.hostId, 'agent_review_summary', {
        worktreePath: session!.worktreePath,
        basePath: session!.basePath,
      }),
  });
}

export function useReviewFileDiff(
  hostId: string,
  worktreePath: string,
  mergeBase: string,
  file: string
) {
  return useQuery({
    queryKey: hostQueryKey(hostId, worktreePath, REVIEW_DOMAIN, 'file', mergeBase, file),
    enabled: hostId.length > 0 && worktreePath.length > 0 && mergeBase.length > 0 && file.length > 0,
    queryFn: () =>
      hostInvoke<AgentReviewFileDiff>(hostId, 'agent_review_file_diff', {
        worktreePath,
        mergeBase,
        file,
      }),
  });
}

function missingAtMergeBase(message: string): boolean {
  return /did not match any file|pathspec|exists on disk, but not in/i.test(message);
}

export async function discardReviewFile(
  session: AgentReviewSession,
  mergeBase: string,
  file: AgentReviewFile
): Promise<void> {
  if (file.untracked) {
    await hostInvoke(session.hostId, 'git_discard_files', {
      path: session.worktreePath,
      files: [file.path],
      untracked: [true],
    });
    return;
  }
  try {
    await hostInvoke(session.hostId, 'git_restore_files_at_commit', {
      path: session.worktreePath,
      commit: mergeBase,
      files: [file.path],
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (!missingAtMergeBase(message)) {
      throw cause;
    }
    await hostInvoke(session.hostId, 'git_discard_files', {
      path: session.worktreePath,
      files: [file.path],
      untracked: [true],
    });
  }
}

export async function commitReviewChanges(
  session: AgentReviewSession,
  message: string
): Promise<void> {
  await hostInvoke(session.hostId, 'stage_files', {
    path: session.worktreePath,
    files: ['.'],
  });
  await hostInvoke(session.hostId, 'commit_changes', {
    path: session.worktreePath,
    message,
    sign: null,
  });
}

export async function mergeReviewBranch(
  session: AgentReviewSession,
  sessionBranch: string
): Promise<string> {
  return hostInvoke<string>(session.hostId, 'git_merge', {
    path: session.basePath,
    branch: sessionBranch,
    strategy: 'ff',
    message: null,
  });
}

export async function cleanupReviewWorktree(
  session: AgentReviewSession,
  sessionBranch: string
): Promise<boolean> {
  await hostInvoke(session.hostId, 'git_worktree_remove', {
    path: session.basePath,
    worktreePath: session.worktreePath,
    force: false,
  });
  const merged = await hostInvoke<boolean>(session.hostId, 'agent_review_branch_merged', {
    path: session.basePath,
    branch: sessionBranch,
  });
  if (!merged) {
    return false;
  }
  await hostInvoke(session.hostId, 'delete_branch', {
    path: session.basePath,
    name: sessionBranch,
    force: false,
  });
  return true;
}

export type FinishStatus = 'idle' | 'running' | 'failed' | 'done';

export interface ReviewFinishApi {
  steps: AgentReviewStep[];
  status: FinishStatus;
  branchKept: boolean;
  message: string;
  setMessage: (value: string) => void;
  runStep: (id: AgentReviewStepId) => void;
  retry: (id: AgentReviewStepId) => void;
  canRun: (id: AgentReviewStepId) => boolean;
  reset: () => void;
}

export function useReviewFinish(
  session: AgentReviewSession | null,
  summary: AgentReviewSummary | null
): ReviewFinishApi {
  const queryClient = useQueryClient();
  const hasUncommitted = (summary?.uncommitted ?? 0) > 0;
  const [steps, setSteps] = React.useState<AgentReviewStep[]>(() =>
    createFinishSteps({ hasUncommitted })
  );
  const [message, setMessage] = React.useState('');
  const [branchKept, setBranchKept] = React.useState(false);

  const reset = React.useCallback(() => {
    setSteps(createFinishSteps({ hasUncommitted }));
    setBranchKept(false);
  }, [hasUncommitted]);

  React.useEffect(() => {
    reset();
  }, [reset]);

  const runStep = React.useCallback(
    (id: AgentReviewStepId) => {
      if (!session || !summary) {
        return;
      }
      if (id === 'commit' && !message.trim()) {
        setSteps((current) =>
          setStepStatus(current, id, 'failed', 'A commit message is required.')
        );
        return;
      }
      setSteps((current) => setStepStatus(current, id, 'running'));
      void (async () => {
        try {
          if (id === 'commit') {
            await commitReviewChanges(session, message.trim());
          } else if (id === 'merge') {
            await mergeReviewBranch(session, summary.sessionBranch);
          } else {
            setBranchKept(!(await cleanupReviewWorktree(session, summary.sessionBranch)));
          }
          setSteps((current) => setStepStatus(current, id, 'done'));
          await queryClient.invalidateQueries({ queryKey: [session.hostId] });
        } catch (cause) {
          setSteps((current) =>
            setStepStatus(
              current,
              id,
              'failed',
              cause instanceof Error ? cause.message : String(cause)
            )
          );
        }
      })();
    },
    [message, queryClient, session, summary]
  );

  return {
    steps,
    status: finishFlowStatus(steps),
    branchKept,
    message,
    setMessage,
    runStep,
    retry: (id) => setSteps((current) => retryStep(current, id)),
    canRun: (id) => canRunStep(steps, id),
    reset,
  };
}

export function useHostLabel(hostId: string): string {
  const meta = useHostMeta(hostId);
  return meta?.name ?? hostId;
}

export function useAgentSessionBusy(worktreePath: string): boolean {
  const busyIn = React.useCallback(
    (state: AgentChatState) =>
      Object.values(state.conversations).some(
        (conversation) =>
          conversation.path === worktreePath && Boolean(conversation.activeTurnId)
      ),
    [worktreePath]
  );
  const codex = useChatStore('codex', busyIn, false);
  const claude = useChatStore('claude', busyIn, false);
  const cursor = useChatStore('cursor', busyIn, false);
  const opencode = useChatStore('opencode', busyIn, false);
  return codex || claude || cursor || opencode;
}
