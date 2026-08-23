import { toast } from 'sonner';

import i18n from '@/lib/i18n';
import { toastError } from '@/lib/error-toast';
import { useRepoStore } from '@/lib/repo-store';
import { toastRebaseError } from './rebase-errors';
import { notifyRebaseResult } from './rebase-feedback';
import { entriesFromCommits, toTodoItems, validateEntries } from './rebase-todo';

export function hasStagedChanges(path: string): boolean {
  return (useRepoStore.getState().status[path] ?? []).some(e => e.staged);
}

export async function dropCommit(
  path: string,
  base: string,
  hash: string
): Promise<void> {
  const store = useRepoStore.getState();
  try {
    const commits = await store.rebaseTodoPreview(path, base);
    const entries = entriesFromCommits(commits).map(e =>
      e.hash === hash ? { ...e, action: 'drop' as const } : e
    );
    const issue = validateEntries(entries);
    if (issue === 'allDropped') {
      toastError(i18n.t('rebase.errors.allDropped'));
      return;
    }
    if (issue) {
      toastError(i18n.t('rebase.errors.todoEmpty'));
      return;
    }
    const res = await store.rebaseInteractive(
      path,
      base,
      toTodoItems(entries),
      true
    );
    notifyRebaseResult(path, res);
  } catch (err) {
    toastRebaseError(err);
  }
}

export async function fixupStaged(
  path: string,
  targetHash: string
): Promise<void> {
  if (!hasStagedChanges(path)) {
    toastError(i18n.t('rebase.errors.nothingStaged'));
    return;
  }
  try {
    const res = await useRepoStore
      .getState()
      .commitFixup(path, targetHash, true);
    if (res.status === 'completed') {
      toast.success(i18n.t('rebaseEditor.fixupSquashed'));
      return;
    }
    if (res.status === 'committed') {
      toast.success(
        i18n.t('rebaseEditor.fixupCommitted', { hash: res.short_hash })
      );
      return;
    }
    notifyRebaseResult(path, {
      status: res.status,
      message: res.message,
      state: res.state,
    });
  } catch (err) {
    toastRebaseError(err);
  }
}
