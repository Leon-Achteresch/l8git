import { formatBackendError } from '@/lib/backend-error';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { create } from 'zustand';
import type { TFunction } from 'i18next';

export type RemoteOpKind = 'fetch' | 'pull' | 'push' | 'clone';

export type GitProgressEvent = {
  opId: string;
  repoPath: string;
  op: RemoteOpKind;
  phase: string;
  percent: number | null;
  detail: string;
};

export type GitProgressDone = {
  opId: string;
  repoPath: string;
  op: RemoteOpKind;
  ok: boolean;
  canceled: boolean;
  message: string;
};

export const REMOTE_CANCELED = '__REMOTE_CANCELED__';

const phaseKeys = new Map([
  ['Enumerating objects', 'enumerating'],
  ['Counting objects', 'counting'],
  ['Compressing objects', 'compressing'],
  ['Receiving objects', 'receiving'],
  ['Resolving deltas', 'resolving'],
  ['Writing objects', 'writing'],
  ['Updating files', 'updating'],
]);

export function remoteProgressPhase(phase: string, t: TFunction): string {
  if (!phase) return t('remoteProgress.starting');
  const key = phaseKeys.get(phase);
  return key ? t(`remoteProgress.phases.${key}`) : phase;
}

export type RemoteOpEntry = {
  opId: string;
  repoPath: string;
  op: RemoteOpKind;
  phase: string;
  percent: number | null;
  detail: string;
  canceling: boolean;
  cancel?: (opId: string) => Promise<boolean>;
  startedAt: number;
};

export type RemoteOpResult = {
  opId: string;
  op: RemoteOpKind;
  repoPath: string;
  status: 'success' | 'failed' | 'canceled';
  message: string;
  startedAt: number;
  finishedAt: number;
  retry?: () => Promise<unknown>;
};

type RemoteOpsState = {
  history: RemoteOpResult[];
  recordResult: (result: RemoteOpResult) => void;
  ops: RemoteOpEntry[];
  startOp: (opId: string, op: RemoteOpKind, repoPath: string, cancel?: RemoteOpEntry['cancel'], startedAt?: number) => void;
  applyProgress: (event: GitProgressEvent) => void;
  markCanceling: (opId: string) => void;
  clearCanceling: (opId: string) => void;
  finishOp: (opId: string) => void;
};

export const useRemoteOps = create<RemoteOpsState>((set) => ({
  ops: [],
  history: [],
  recordResult: (result) => set(s => ({ history: [result, ...s.history.filter(r => r.opId !== result.opId)].slice(0, 30) })),
  startOp: (opId, op, repoPath, cancel, startedAt = Date.now()) =>
    set((s) =>
      s.ops.some((o) => o.opId === opId)
        ? s
        : {
            ops: [
              ...s.ops,
              {
                opId,
                repoPath,
                op,
                phase: '',
                percent: null,
                detail: '',
                canceling: false,
                cancel,
                startedAt,
              },
            ],
          },
    ),
  applyProgress: (event) =>
    set((s) => {
      const index = s.ops.findIndex((o) => o.opId === event.opId);
      if (index < 0) return s;
      const current = s.ops[index];
      const phase = event.phase || current.phase;
      const percent = typeof event.percent === 'number' && Number.isFinite(event.percent) ? Math.max(0, Math.min(100, event.percent)) : null;
      const detail = event.detail || '';
      if (phase === current.phase && percent === current.percent && detail === current.detail) return s;
      const ops = s.ops.slice();
      ops[index] = { ...current, phase, percent, detail };
      return { ops };
    }),
  markCanceling: (opId) =>
    set((s) => ({
      ops: s.ops.map((o) => (o.opId === opId ? { ...o, canceling: true } : o)),
    })),
  clearCanceling: (opId) => set(s => ({ ops: s.ops.map(op => op.opId === opId ? { ...op, canceling: false } : op) })),
  finishOp: (opId) =>
    set((s) => {
      const ops = s.ops.filter((o) => o.opId !== opId);
      return ops.length === s.ops.length ? s : { ops };
    }),
}));

let listenersAttached: Promise<void> | null = null;

export function ensureRemoteProgressListeners(): Promise<void> {
  if (listenersAttached) return listenersAttached;
  const attached = Promise.allSettled([
    listen<GitProgressEvent>('git-progress', event => useRemoteOps.getState().applyProgress(event.payload)),
    listen<GitProgressDone>('git-progress-done', event => useRemoteOps.getState().finishOp(event.payload.opId)),
  ]).then(results => {
    if (results.some(result => result.status === 'rejected')) {
      for (const result of results) if (result.status === 'fulfilled') result.value();
      listenersAttached = null;
    }
  });
  listenersAttached = attached;
  return attached;
}

let opCounter = 0;

export function newOpId(): string {
  opCounter += 1;
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${Date.now().toString(36)}-${opCounter}-${random}`;
}

export function isRemoteCanceled(error: unknown): boolean {
  return String(error).includes(REMOTE_CANCELED);
}

const pendingCancellations = new Map<string, Promise<boolean>>();

export function cancelRemoteOp(opId: string): Promise<boolean> {
  const pending = pendingCancellations.get(opId);
  if (pending) return pending;
  const current = useRemoteOps.getState().ops.find(op => op.opId === opId);
  if (!current || current.canceling) return Promise.resolve(!!current);
  const request = Promise.resolve().then(async () => {
    try {
      // The operation may finish between the click and the IPC request.
      if (!useRemoteOps.getState().ops.some(op => op.opId === opId)) return false;
      const accepted = current.cancel ? await current.cancel(opId) : await invoke<boolean>('git_remote_cancel', { opId });
      if (!accepted) useRemoteOps.getState().clearCanceling(opId);
      return accepted;
    } catch {
      useRemoteOps.getState().clearCanceling(opId);
      return false;
    } finally {
      pendingCancellations.delete(opId);
    }
  });
  pendingCancellations.set(opId, request);
  useRemoteOps.getState().markCanceling(opId);
  return request;
}

export async function runRemoteOp<T>(
  op: RemoteOpKind,
  repoPath: string,
  run: (opId: string) => Promise<T>,
  options?: { cancel: NonNullable<RemoteOpEntry['cancel']>; retryCanceled?: boolean },
): Promise<T> {
  if (!options) await ensureRemoteProgressListeners();
  const opId = newOpId();
  const startedAt = Date.now();
  const identity = { opId, op, repoPath, startedAt };
  useRemoteOps.getState().startOp(opId, op, repoPath, options?.cancel, startedAt);
  try {
    const result = await run(opId);
    useRemoteOps.getState().recordResult({ ...identity, status: 'success', message: '', finishedAt: Date.now() });
    return result;
  } catch (error) {
    const canceled = isRemoteCanceled(error);
    useRemoteOps.getState().recordResult({
      ...identity,
      status: canceled ? 'canceled' : 'failed',
      message: canceled ? '' : formatBackendError(error),
      finishedAt: Date.now(),
      retry: op === 'fetch' && (!canceled || options?.retryCanceled)
        ? () => runRemoteOp(op, repoPath, run, options)
        : undefined,
    });
    throw error;
  } finally {
    useRemoteOps.getState().finishOp(opId);
  }
}
