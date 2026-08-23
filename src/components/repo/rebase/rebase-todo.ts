import type {
  RebaseCommit,
  RebaseTodoAction,
  RebaseTodoItem,
} from '@/lib/repo-store';

export const REBASE_ACTIONS: readonly RebaseTodoAction[] = [
  'pick',
  'reword',
  'squash',
  'fixup',
  'edit',
  'drop',
];

const SHORTCUTS: Record<string, RebaseTodoAction> = {
  p: 'pick',
  r: 'reword',
  s: 'squash',
  f: 'fixup',
  e: 'edit',
  d: 'drop',
};

export type RebaseEntry = {
  hash: string;
  shortHash: string;
  subject: string;
  action: RebaseTodoAction;
  message: string;
  baseMessage: string;
  messageLoaded: boolean;
};

export type RebaseTodoIssue = 'empty' | 'allDropped' | 'firstSquash' | null;

export type RebaseTodoSummary = {
  counts: Record<RebaseTodoAction, number>;
  dropped: number;
  reordered: boolean;
  changed: boolean;
};

export function actionForKey(key: string): RebaseTodoAction | null {
  if (key.length !== 1) return null;
  return SHORTCUTS[key.toLowerCase()] ?? null;
}

export function entriesFromCommits(
  commits: readonly RebaseCommit[],
  preset?: { hash: string; action: RebaseTodoAction } | null
): RebaseEntry[] {
  return commits.map(c => ({
    hash: c.hash,
    shortHash: c.short_hash,
    subject: c.subject,
    action: preset && preset.hash === c.hash ? preset.action : 'pick',
    message: c.subject,
    baseMessage: c.subject,
    messageLoaded: false,
  }));
}

export function usesMessage(action: RebaseTodoAction): boolean {
  return action === 'reword' || action === 'squash';
}

export function isAttached(action: RebaseTodoAction): boolean {
  return action === 'squash' || action === 'fixup';
}

export function moveEntry(
  entries: readonly RebaseEntry[],
  from: number,
  to: number
): RebaseEntry[] {
  if (from === to) return entries.slice();
  if (from < 0 || from >= entries.length) return entries.slice();
  if (to < 0 || to >= entries.length) return entries.slice();
  const next = entries.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function validateEntries(
  entries: readonly RebaseEntry[]
): RebaseTodoIssue {
  if (entries.length === 0) return 'empty';
  const kept = entries.filter(e => e.action !== 'drop');
  if (kept.length === 0) return 'allDropped';
  if (isAttached(kept[0].action)) return 'firstSquash';
  return null;
}

export function toTodoItems(entries: readonly RebaseEntry[]): RebaseTodoItem[] {
  return entries.map(e => {
    const message = e.message.trim();
    const useMessage =
      usesMessage(e.action) &&
      message.length > 0 &&
      message !== e.baseMessage.trim();
    return {
      action: e.action,
      hash: e.hash,
      newMessage: useMessage ? message : null,
    };
  });
}

export function withFullMessage(
  entries: readonly RebaseEntry[],
  hash: string,
  fullMessage: string
): RebaseEntry[] {
  return entries.map(e =>
    e.hash === hash && !e.messageLoaded
      ? {
          ...e,
          message:
            e.message.trim() === e.baseMessage.trim() ? fullMessage : e.message,
          baseMessage: fullMessage,
          messageLoaded: true,
        }
      : e
  );
}

export function summarizeEntries(
  entries: readonly RebaseEntry[],
  originalOrder: readonly string[]
): RebaseTodoSummary {
  const counts: Record<RebaseTodoAction, number> = {
    pick: 0,
    reword: 0,
    squash: 0,
    fixup: 0,
    edit: 0,
    drop: 0,
  };
  for (const e of entries) counts[e.action] += 1;
  const reordered =
    entries.length !== originalOrder.length ||
    entries.some((e, i) => e.hash !== originalOrder[i]);
  const touched = entries.some(e => e.action !== 'pick');
  return {
    counts,
    dropped: counts.drop,
    reordered,
    changed: reordered || touched,
  };
}
