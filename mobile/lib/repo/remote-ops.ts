import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { create } from 'zustand';

import { getClient, subscribeHostEvent, useOnlineHostIds } from '~/lib/connections';
import { hostScopeKey, useHostInvoke } from '~/lib/query';
import { useHydratedWorkspaceDefaults } from '~/lib/repo/prefs';

export type RemoteOpKind = 'fetch' | 'pull' | 'push';

export const REMOTE_CANCELED = '__REMOTE_CANCELED__';

export type GitProgressEvent = {
  opId: string;
  repoPath: string;
  op: string;
  phase: string;
  percent: number | null;
  detail: string;
};

export type RemoteOpEntry = {
  opId: string;
  hostId: string;
  repoPath: string;
  op: RemoteOpKind;
  phase: string;
  percent: number | null;
  detail: string;
  startedAt: number;
};

export type RemoteOpResult = {
  id: string;
  op: RemoteOpKind;
  tone: 'success' | 'error' | 'info';
  message: string;
};

interface RemoteOpsState {
  ops: RemoteOpEntry[];
  result: RemoteOpResult | null;
  start: (entry: RemoteOpEntry) => void;
  progress: (hostId: string, event: GitProgressEvent) => void;
  finish: (opId: string) => void;
  setResult: (result: RemoteOpResult | null) => void;
}

export const useRemoteOps = create<RemoteOpsState>((set) => ({
  ops: [],
  result: null,

  start: (entry) =>
    set((state) =>
      state.ops.some((op) => op.opId === entry.opId)
        ? state
        : { ops: [...state.ops, entry] }
    ),

  progress: (hostId, event) =>
    set((state) => {
      const index = state.ops.findIndex(
        (op) => op.opId === event.opId && op.hostId === hostId
      );
      if (index < 0) {
        return state;
      }
      const current = state.ops[index];
      const ops = state.ops.slice();
      ops[index] = {
        ...current,
        phase: event.phase || current.phase,
        percent: event.percent ?? current.percent,
        detail: event.detail || '',
      };
      return { ops };
    }),

  finish: (opId) =>
    set((state) => {
      const ops = state.ops.filter((op) => op.opId !== opId);
      return ops.length === state.ops.length ? state : { ops };
    }),

  setResult: (result) => set({ result }),
}));

let counter = 0;

export function newOpId(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isRemoteCanceled(error: unknown): boolean {
  return String(error).includes(REMOTE_CANCELED);
}

function subscribeProgress(hostId: string): () => void {
  return subscribeHostEvent(hostId, 'git-progress', (payload) => {
    const event = payload as GitProgressEvent | null;
    if (event && typeof event.opId === 'string') {
      useRemoteOps.getState().progress(hostId, event);
    }
  });
}

export function useRemoteProgressBridge(): void {
  const onlineHostIds = useOnlineHostIds();
  const key = onlineHostIds.join(' ');

  React.useEffect(() => {
    const ids = key.length > 0 ? key.split(' ') : [];
    const offs = ids.map(subscribeProgress);
    return () => {
      for (const off of offs) {
        off();
      }
    };
  }, [key]);
}

export function useActiveRemoteOp(hostId: string, repoPath: string): RemoteOpEntry | null {
  return useRemoteOps(
    (state) =>
      state.ops.find((op) => op.hostId === hostId && op.repoPath === repoPath) ?? null
  );
}

export function useOldestRemoteOp(): RemoteOpEntry | null {
  return useRemoteOps((state) => state.ops[0] ?? null);
}

export type RemoteOpOptions = {
  setUpstream?: boolean;
};

export type RemoteOpRunner = {
  run: (op: RemoteOpKind, options?: RemoteOpOptions) => Promise<void>;
  busy: RemoteOpKind | null;
};

export function useRemoteOpRunner(hostId: string, repoPath: string): RemoteOpRunner {
  const invoke = useHostInvoke(hostId);
  const queryClient = useQueryClient();
  const defaults = useHydratedWorkspaceDefaults();
  const [busy, setBusy] = React.useState<RemoteOpKind | null>(null);

  const run = React.useCallback(
    async (op: RemoteOpKind, options?: RemoteOpOptions) => {
      if (!hostId || !repoPath) {
        return;
      }
      const opId = newOpId();
      const store = useRemoteOps.getState();
      store.setResult(null);
      store.start({
        opId,
        hostId,
        repoPath,
        op,
        phase: op === 'fetch' ? 'Fetching' : op === 'pull' ? 'Pulling' : 'Pushing',
        percent: null,
        detail: '',
        startedAt: Date.now(),
      });
      setBusy(op);

      try {
        const output = await (op === 'fetch'
          ? invoke<string>('git_fetch', {
              path: repoPath,
              pruneBranches: defaults.fetchPruneBranches,
              pruneTags: defaults.fetchPruneTags,
              remote: null,
              allRemotes: null,
              opId,
            })
          : op === 'pull'
            ? invoke<string>('git_pull', {
                path: repoPath,
                strategy: defaults.pullStrategy,
                remote: null,
                opId,
              })
            : invoke<string>('git_push', {
                path: repoPath,
                setUpstream: options?.setUpstream ?? false,
                remote: null,
                forceMode: null,
                tagsMode: null,
                atomic: null,
                noVerify: defaults.pushNoVerify,
                dryRun: null,
                opId,
              }));

        useRemoteOps.getState().setResult({
          id: opId,
          op,
          tone: 'success',
          message: output.trim() || `${LABEL[op]} finished.`,
        });
      } catch (cause) {
        useRemoteOps.getState().setResult({
          id: opId,
          op,
          tone: isRemoteCanceled(cause) ? 'info' : 'error',
          message: isRemoteCanceled(cause)
            ? `${LABEL[op]} canceled.`
            : cleanError(cause),
        });
      } finally {
        useRemoteOps.getState().finish(opId);
        setBusy(null);
        void queryClient.invalidateQueries({ queryKey: hostScopeKey(hostId, repoPath) });
      }
    },
    [defaults, hostId, invoke, queryClient, repoPath]
  );

  return { run, busy };
}

export async function cancelRemoteOp(hostId: string, opId: string): Promise<void> {
  await getClient(hostId)
    ?.request('git_remote_cancel', { opId })
    .catch(() => undefined);
}

const LABEL: Record<RemoteOpKind, string> = {
  fetch: 'Fetch',
  pull: 'Pull',
  push: 'Push',
};

export function remoteOpLabel(op: RemoteOpKind): string {
  return LABEL[op];
}

export function cleanError(cause: unknown): string {
  const text = cause instanceof Error ? cause.message : String(cause);
  return text.replace(REMOTE_CANCELED, '').trim() || 'Unknown error';
}
