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
  getAgentReviewFinishController,
  releaseAgentReviewFinishController,
  reviewSnapshotSignature,
  type AgentReviewFinishController,
  type AgentReviewFinishContext,
  type AgentReviewFinishSnapshot,
  type AgentReviewMergeStrategy,
  type AgentReviewFile,
  type AgentReviewFileDiff,
  type AgentReviewStep,
  type AgentReviewStepId,
  type AgentReviewSummary,
} from '@desktop/lib/agents/agent-review';

import { getClient, useConnections, useHostMeta, useOnlineHostIds } from '~/lib/connections';
import { hostQueryKey } from '~/lib/query';
import { useRepoRegistry } from '~/lib/repo/registry';

import { useAgentBinding } from './binding';
import {
  flushFinishCheckpoint,
  listUnfinishedFinishContexts,
  prepareFinishControllerContext,
  recoverFinishContext,
} from './finish-storage';
import { mobileFinishDependencies, mobileFinishIsComplete, type ReviewFinishAvailability } from './review-finish';
import { AGENT_PROVIDERS, tryChatStore, useChatStore, type AgentChatState } from './stores';

export type {
  AgentReviewFile,
  AgentReviewFileDiff,
  AgentReviewStep,
  AgentReviewStepId,
  AgentReviewSummary,
  AgentReviewMergeStrategy,
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
  recovering?: boolean;
  cleanupPending?: boolean;
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
  args: Record<string, unknown> = {}
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
  const main = entries.find((entry) => entry.is_main);
  if (!main) {
    return null;
  }
  const self = entries.find((entry) => entry.path === worktreePath);
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
  const recovery = useQuery({
    queryKey: hostQueryKey(hostId, worktreePath, REVIEW_DOMAIN, 'recovery-context'),
    enabled: Boolean(hostId && worktreePath),
    queryFn: () => recoverFinishContext(hostId, worktreePath),
  });
  const query = useWorktreeList(hostId, recovery.data?.basePath ?? worktreePath, !recovery.isPending);
  const session = React.useMemo(
    () => (query.data ? sessionFromWorktrees(hostId, worktreePath, query.data) : null) ??
      (recovery.data ? {
        hostId,
        worktreePath: recovery.data.worktreePath,
        basePath: recovery.data.basePath,
        branch: recovery.data.sessionBranch,
      } : null),
    [hostId, query.data, recovery.data, worktreePath]
  );
  return {
    session, recoveryContext: recovery.data ?? null,
    live: Boolean(query.data && sessionFromWorktrees(hostId, worktreePath, query.data)),
    loading: recovery.isPending || query.isPending,
    error: session ? null : query.error ?? recovery.error,
    refetch: query.refetch,
  };
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
  const recoveryResults = useQueries({
    queries: Object.keys(hostNames).map((hostId) => ({
      queryKey: hostQueryKey(hostId, null, REVIEW_DOMAIN, 'unfinished-finish'),
      queryFn: () => listUnfinishedFinishContexts(hostId),
      staleTime: 0,
    })),
  });

  const loading = [...results, ...recoveryResults].some((result) => result.isPending);
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
      const key = JSON.stringify([pair.hostId, entry.path]);
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

  for (const result of recoveryResults) {
    for (const { context, checkpoint } of result.data ?? []) {
      const hostId = context.hostId!;
      const key = JSON.stringify([hostId, context.worktreePath]);
      if (seen.has(key)) continue;
      seen.add(key);
      sessions.push({
        hostId, worktreePath: context.worktreePath, basePath: context.basePath,
        branch: context.sessionBranch, hostName: hostNames[hostId] ?? hostId,
        repoName: leafName(context.basePath), name: leafName(context.worktreePath), recovering: true,
        cleanupPending: checkpoint.worktreeRemoved,
      });
    }
  }

  sessions.sort(
    (left, right) =>
      left.repoName.localeCompare(right.repoName) || left.name.localeCompare(right.name)
  );

  return { sessions, loading };
}

export function useReviewSummary(session: AgentReviewSession | null, enabled = true) {
  return useQuery({
    queryKey: hostQueryKey(
      session?.hostId ?? '',
      session?.worktreePath ?? null,
      REVIEW_DOMAIN,
      'summary',
      session?.basePath ?? ''
    ),
    enabled: enabled && Boolean(session),
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
    queryKey: hostQueryKey(
      hostId,
      worktreePath,
      REVIEW_DOMAIN,
      'file',
      mergeBase,
      file
    ),
    enabled:
      hostId.length > 0 &&
      worktreePath.length > 0 &&
      mergeBase.length > 0 &&
      file.length > 0,
    queryFn: () => reviewFileDiff(hostId, worktreePath, mergeBase, file),
  });
}

export function reviewFileDiff(
  hostId: string,
  worktreePath: string,
  mergeBase: string,
  file: string
): Promise<AgentReviewFileDiff> {
  return hostInvoke<AgentReviewFileDiff>(hostId, 'agent_review_file_diff', {
    worktreePath,
    mergeBase,
    file,
  });
}

export async function discardReviewFile(
  session: AgentReviewSession,
  mergeBase: string,
  file: AgentReviewFile,
  expectedFingerprint: string
): Promise<void> {
  if (!expectedFingerprint) {
    throw new Error(`__FILE_CHANGED__|${file.path}`);
  }
  await hostInvoke(session.hostId, 'agent_review_discard_change', {
    worktreePath: session.worktreePath,
    mergeBase,
    file: file.path,
    expectedFingerprint,
    patch: null,
  });
}

export interface ReviewFileDiscardPreview {
  readonly session: Readonly<AgentReviewSession>;
  readonly mergeBase: string;
  readonly file: Readonly<AgentReviewFile>;
  readonly snapshot: Readonly<AgentReviewFileDiff>;
}

export async function discardReviewFileWithPreview(
  session: AgentReviewSession,
  mergeBase: string,
  file: AgentReviewFile,
  confirm: (preview: ReviewFileDiscardPreview) => Promise<boolean>,
  isCurrent: () => boolean = () => true
): Promise<boolean> {
  const targetSession = Object.freeze({ ...session });
  const targetFile = Object.freeze({ ...file });
  const snapshot = await reviewFileDiff(
    targetSession.hostId,
    targetSession.worktreePath,
    mergeBase,
    targetFile.path
  );
  if (!isCurrent()) return false;
  const fingerprint = snapshot.fingerprint;
  if (!fingerprint) throw new Error(`__FILE_CHANGED__|${targetFile.path}`);
  const preview = Object.freeze({
    session: targetSession,
    mergeBase,
    file: targetFile,
    snapshot: Object.freeze({ ...snapshot }),
  });
  if (!(await confirm(preview)) || !isCurrent()) return false;
  // Keep the token from the displayed preview through confirmation. Fetching
  // another token here would allow newer, unreviewed changes to be discarded.
  await discardReviewFile(targetSession, mergeBase, targetFile, fingerprint);
  return true;
}

export function reviewDiscardPreviewMessage(
  preview: ReviewFileDiscardPreview
): string {
  const text = preview.snapshot.diff ?? preview.snapshot.untrackedPlain ?? '';
  const lines = text.split('\n');
  const excerpt = lines.slice(0, 16).join('\n').slice(0, 1200);
  const shortened = lines.length > 16 || text.length > 1200;
  const content = preview.snapshot.isBinary
    ? 'Binary change. A text preview is unavailable.'
    : excerpt || 'No textual changes against the merge base.';
  return `Discard all session changes in ${preview.file.path}? Files added during the session will be removed.\n\n${content}${shortened && !preview.snapshot.isBinary ? '\n\nPreview shortened. Open the file to review the full change.' : ''}`;
}

export type FinishStatus = 'idle' | 'running' | 'failed' | 'done';

export interface ReviewFinishApi extends AgentReviewFinishSnapshot {
  status: FinishStatus;
  ready: boolean;
  key: string | null;
  expectedBaseBranch: string;
  expectedSessionBranch: string;
  reviewed: boolean;
  setMessage: (value: string) => void;
  setStrategy: (value: AgentReviewMergeStrategy) => void;
  markReviewed: (value: boolean) => void;
  runStep: (id: AgentReviewStepId) => void;
  retry: (id: AgentReviewStepId) => void;
  canRun: (id: AgentReviewStepId) => boolean;
  refresh: () => void;
  isComplete: () => boolean;
}

const EMPTY_FINISH_SNAPSHOT: AgentReviewFinishSnapshot = {
  steps: [
    { id: 'commit', status: 'pending', error: null },
    { id: 'merge', status: 'pending', error: null },
    { id: 'cleanup', status: 'pending', error: null },
  ],
  summary: null, sessionHead: '', reviewedSignature: null, worktreeRemoved: false,
  worktreeMetadataRemoved: false, branchDeleted: false, strategy: 'ff', checking: false, validated: false, checkError: null, message: '',
};
const subscribeEmptyFinish = () => () => undefined;
const emptyFinishSnapshot = () => EMPTY_FINISH_SNAPSHOT;

export function useReviewFinish(
  session: AgentReviewSession | null,
  summary: AgentReviewSummary | null,
  options: {
    hostId: string;
    worktreePath: string;
    recoveryContext?: AgentReviewFinishContext | null;
    available: boolean;
    isActive: () => boolean;
  }
): ReviewFinishApi {
  const queryClient = useQueryClient();
  const [prepared, setPrepared] = React.useState<{ key: string; controller: AgentReviewFinishController } | null>(null);
  const recovery = options.recoveryContext;
  const context = React.useMemo<AgentReviewFinishContext | null>(() => {
    if (session && summary) return {
      hostId: session.hostId, worktreePath: session.worktreePath, basePath: session.basePath,
      baseBranch: summary.baseBranch, sessionBranch: summary.sessionBranch,
      ...(recovery?.worktreeCreatedAt === undefined ? {} : { worktreeCreatedAt: recovery.worktreeCreatedAt }),
    };
    if (recovery) return recovery;
    // Successful cleanup invalidates the worktree query and its recovery entry.
    // Keep that controller until the finish sheet observes its completed state.
    const retained = prepared?.controller.context;
    return retained?.hostId === options.hostId && retained.worktreePath === options.worktreePath ? retained : null;
  }, [session?.hostId, session?.worktreePath, session?.basePath, summary?.baseBranch, summary?.sessionBranch, recovery, prepared, options.hostId, options.worktreePath]);
  const key = context ? JSON.stringify([context.hostId, context.worktreePath, context.basePath, context.baseBranch, context.sessionBranch, context.worktreeCreatedAt ?? null]) : null;
  const mounted = React.useRef(true);
  const current = React.useRef({ key, session, options });
  current.current = { key, session, options };
  const availabilityFor = (captured: AgentReviewFinishContext, capturedKey: string): ReviewFinishAvailability => ({
    hostId: current.current.options.hostId,
    worktreePath: current.current.options.worktreePath,
    available: mounted.current && current.current.key === capturedKey && current.current.options.available &&
      current.current.options.isActive() && useAgentBinding.getState().hostId === captured.hostId &&
      Boolean(getClient(captured.hostId!)),
    busy: isAgentSessionBusyNow(captured.hostId!, captured.worktreePath),
  });
  const [preparationError, setPreparationError] = React.useState<{ key: string; error: string } | null>(null);
  const [prepareNonce, prepareAgain] = React.useReducer((value: number) => value + 1, 0);
  const controller = prepared?.key === key ? prepared.controller : null;
  const state = React.useSyncExternalStore(controller?.subscribe ?? subscribeEmptyFinish, controller?.getSnapshot ?? emptyFinishSnapshot);

  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  React.useEffect(() => {
    if (!context?.hostId || !key) return;
    let canceled = false;
    const captured = { ...context, hostId: context.hostId };
    void (async () => {
      try {
        await prepareFinishControllerContext(captured);
        if (canceled) return;
        const dependencies = mobileFinishDependencies(captured, {
          hostInvoke,
          current: () => availabilityFor(captured, key),
          flushCheckpoint: () => flushFinishCheckpoint(captured),
          onChanged: async () => { await queryClient.invalidateQueries({ queryKey: [captured.hostId] }); },
        });
        const next = getAgentReviewFinishController(captured, (summary?.uncommitted ?? 0) > 0, dependencies);
        setPrepared({ key, controller: next });
        setPreparationError(null);
      } catch (cause) {
        if (!canceled) setPreparationError({ key, error: cause instanceof Error ? cause.message : String(cause) });
      }
    })();
    return () => { canceled = true; };
  }, [key, prepareNonce, queryClient]);

  React.useEffect(() => () => { if (controller) releaseAgentReviewFinishController(controller); }, [controller]);
  const reviewed = Boolean(state.summary && state.reviewedSignature === reviewSnapshotSignature(state.summary, state.sessionHead));
  const run = (id: AgentReviewStepId, retry = false) => {
    if (!controller || !options.available || !options.isActive()) return;
    void controller.run(id, retry);
  };
  return {
    ...state,
    checking: state.checking || Boolean(key && !controller && preparationError?.key !== key),
    checkError: preparationError?.key === key ? preparationError.error : state.checkError,
    ready: Boolean(controller), key, reviewed, status: finishFlowStatus(state.steps),
    expectedBaseBranch: context?.baseBranch ?? '', expectedSessionBranch: context?.sessionBranch ?? '',
    setMessage: (message) => controller?.setMessage(message),
    setStrategy: (strategy) => controller?.setStrategy(strategy),
    markReviewed: (value) => controller?.markReviewed(value),
    runStep: (id) => run(id), retry: (id) => run(id, true),
    canRun: (id) => Boolean(controller && state.validated && !state.checking && canRunStep(state.steps, id)),
    refresh: () => { if (controller) void controller.refresh(); else prepareAgain(); },
    isComplete: () => {
      const latest = controller?.getSnapshot();
      return Boolean(controller && latest && key && mobileFinishIsComplete(controller.context, latest, availabilityFor(controller.context, key)));
    },
  };
}

export function useHostLabel(hostId: string): string {
  const meta = useHostMeta(hostId);
  return meta?.name ?? hostId;
}

export function isAgentSessionBusyNow(hostId: string, worktreePath: string): boolean {
  if (useAgentBinding.getState().hostId !== hostId) return false;
  return AGENT_PROVIDERS.some((provider) => {
    const state = tryChatStore(provider)?.getState();
    return state ? Object.values(state.conversations).some((conversation) =>
      conversation.path === worktreePath && Boolean(conversation.activeTurnId)) : false;
  });
}

export function useAgentSessionBusy(hostId: string, worktreePath: string): boolean {
  const boundHost = useAgentBinding((state) => state.hostId);
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
  return boundHost === hostId && (codex || claude || cursor || opencode);
}
