import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { create } from 'zustand';

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

export type RemoteOpEntry = {
  opId: string;
  repoPath: string;
  op: RemoteOpKind;
  phase: string;
  percent: number | null;
  detail: string;
  canceling: boolean;
  startedAt: number;
};

type RemoteOpsState = {
  ops: RemoteOpEntry[];
  startOp: (opId: string, op: RemoteOpKind, repoPath: string) => void;
  applyProgress: (event: GitProgressEvent) => void;
  markCanceling: (opId: string) => void;
  finishOp: (opId: string) => void;
};

export const useRemoteOps = create<RemoteOpsState>((set) => ({
  ops: [],
  startOp: (opId, op, repoPath) =>
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
                startedAt: Date.now(),
              },
            ],
          },
    ),
  applyProgress: (event) =>
    set((s) => {
      const index = s.ops.findIndex((o) => o.opId === event.opId);
      if (index < 0) return s;
      const current = s.ops[index];
      const next: RemoteOpEntry = {
        ...current,
        phase: event.phase || current.phase,
        percent: event.percent ?? current.percent,
        detail: event.detail || '',
      };
      const ops = s.ops.slice();
      ops[index] = next;
      return { ops };
    }),
  markCanceling: (opId) =>
    set((s) => ({
      ops: s.ops.map((o) => (o.opId === opId ? { ...o, canceling: true } : o)),
    })),
  finishOp: (opId) =>
    set((s) => {
      const ops = s.ops.filter((o) => o.opId !== opId);
      return ops.length === s.ops.length ? s : { ops };
    }),
}));

let listenersAttached = false;

export function ensureRemoteProgressListeners() {
  if (listenersAttached) return;
  listenersAttached = true;
  void listen<GitProgressEvent>('git-progress', (event) => {
    useRemoteOps.getState().applyProgress(event.payload);
  });
  void listen<GitProgressDone>('git-progress-done', (event) => {
    useRemoteOps.getState().finishOp(event.payload.opId);
  });
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

export async function cancelRemoteOp(opId: string): Promise<boolean> {
  useRemoteOps.getState().markCanceling(opId);
  try {
    return await invoke<boolean>('git_remote_cancel', { opId });
  } catch {
    return false;
  }
}

export async function runRemoteOp<T>(
  op: RemoteOpKind,
  repoPath: string,
  run: (opId: string) => Promise<T>,
): Promise<T> {
  ensureRemoteProgressListeners();
  const opId = newOpId();
  useRemoteOps.getState().startOp(opId, op, repoPath);
  try {
    return await run(opId);
  } finally {
    useRemoteOps.getState().finishOp(opId);
  }
}
