import { Button } from '@/components/ui/button';
import type { RebaseResult } from '@/lib/repo-store';
import { useRepoStore } from '@/lib/repo-store';
import { useUiStore } from '@/lib/ui-store';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  FastForward,
  GitMerge,
  Layers,
  SkipForward,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toastRebaseError } from './rebase-errors';
import { notifyRebaseResult } from './rebase-feedback';

type Action = 'continue' | 'skip' | 'abort';

export function RebaseStatusBanner({ path }: { path: string }) {
  const { t } = useTranslation();
  const state = useRepoStore(s => s.rebaseState[path]);
  const statusEntries = useRepoStore(s => s.status[path]);
  const openMergeEditor = useUiStore(s => s.openMergeEditor);

  const [busy, setBusy] = useState<Action | null>(null);
  const [abortArmed, setAbortArmed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    void useRepoStore.getState().reloadRebaseState(path);
  }, [path, statusEntries]);

  if (!state?.in_progress) return null;

  const conflicts = state.conflicted_paths;
  const hasUnstagedConflicts = (statusEntries ?? []).some(
    e => e.worktree_status === 'U' || e.index_status === 'U'
  );
  const continueDisabled =
    busy !== null || (conflicts.length > 0 && hasUnstagedConflicts);
  const conflictLabel =
    conflicts.length === 1
      ? t('rebaseBanner.conflicts_one', { count: conflicts.length })
      : t('rebaseBanner.conflicts_other', { count: conflicts.length });

  async function run(kind: Action, fn: () => Promise<RebaseResult>) {
    setBusy(kind);
    try {
      const res = await fn();
      notifyRebaseResult(path, res);
    } catch (err) {
      toastRebaseError(err);
    } finally {
      setBusy(null);
      setAbortArmed(false);
    }
  }

  const store = useRepoStore.getState();
  const progress =
    state.total > 0
      ? t('rebaseBanner.progress', { step: state.step, total: state.total })
      : null;
  const actionLabel = state.current_action
    ? t(`rebaseBanner.action_${state.current_action}`, {
        defaultValue: state.current_action,
      })
    : null;

  return (
    <div
      className={cn(
        'flex flex-col gap-2 border-b border-git-modified/40 bg-git-modified/10 px-4 py-3 text-sm'
      )}
      role='status'
      aria-live='polite'
    >
      <div className='flex flex-wrap items-center gap-2'>
        <Layers className='h-4 w-4 text-git-modified' />
        <span className='font-medium'>
          {state.head_name
            ? t('rebaseBanner.titleWithBranch', {
                branch: state.head_name,
                onto: state.onto_short ?? '',
              })
            : t('rebaseBanner.title')}
        </span>
        {progress ? (
          <span className='rounded bg-git-modified/20 px-1.5 py-0.5 font-mono text-[11px]'>
            {progress}
          </span>
        ) : null}
        {state.stopped ? (
          <span
            className='min-w-0 truncate text-xs text-muted-foreground'
            title={state.stopped.subject}
          >
            <code className='mr-1 font-mono text-[11px] text-foreground'>
              {state.stopped.short_hash}
            </code>
            {state.stopped.subject}
          </span>
        ) : null}
        {actionLabel ? (
          <span className='rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground'>
            {actionLabel}
          </span>
        ) : null}
        {conflicts.length > 0 ? (
          <Button
            type='button'
            variant='link'
            size='xs'
            onClick={() => setExpanded(v => !v)}
            className='px-0 text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground'
          >
            <AlertTriangle className='h-3 w-3 text-git-modified' />
            {conflictLabel}
          </Button>
        ) : (
          <span className='text-xs text-muted-foreground'>
            {t('rebaseBanner.noConflicts')}
          </span>
        )}
        <div className='ml-auto flex items-center gap-2'>
          {conflicts.length > 0 ? (
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={() => openMergeEditor(path)}
              disabled={busy !== null}
            >
              <GitMerge className='h-3.5 w-3.5' />
              {t('rebaseBanner.resolve')}
            </Button>
          ) : null}
          <Button
            type='button'
            size='sm'
            onClick={() => void run('continue', () => store.rebaseContinue(path))}
            disabled={continueDisabled}
            title={
              continueDisabled && conflicts.length > 0
                ? t('rebaseBanner.continueHint')
                : undefined
            }
          >
            <FastForward className='h-3.5 w-3.5' />
            {busy === 'continue'
              ? t('editRemote.saveBusy')
              : t('rebaseBanner.continueVerb')}
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            onClick={() => void run('skip', () => store.rebaseSkip(path))}
            disabled={busy !== null}
            title={t('rebaseBanner.skipHint')}
          >
            <SkipForward className='h-3.5 w-3.5' />
            {busy === 'skip'
              ? t('editRemote.saveBusy')
              : t('rebaseBanner.skipVerb')}
          </Button>
          {abortArmed ? (
            <Button
              type='button'
              variant='destructive'
              size='sm'
              onClick={() => void run('abort', () => store.rebaseAbort(path))}
              disabled={busy !== null}
              title={t('rebaseBanner.abortHint')}
            >
              <X className='h-3.5 w-3.5' />
              {busy === 'abort'
                ? t('editRemote.saveBusy')
                : t('rebaseBanner.abortConfirm')}
            </Button>
          ) : (
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={() => setAbortArmed(true)}
              disabled={busy !== null}
              className='text-destructive hover:text-destructive'
            >
              <X className='h-3.5 w-3.5' />
              {t('rebaseBanner.abortVerb')}
            </Button>
          )}
        </div>
      </div>
      {expanded && conflicts.length > 0 ? (
        <ul className='grid gap-0.5 rounded-md border border-git-modified/30 bg-background/60 p-2 font-mono text-xs'>
          {conflicts.map(p => (
            <li key={p}>
              <button
                type='button'
                onClick={() => openMergeEditor(path, p)}
                className='w-full truncate text-left hover:text-foreground'
                title={p}
              >
                {p}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {state.todo.length > 0 ? (
        <p className='text-[11px] text-muted-foreground'>
          {t('rebaseBanner.remaining', { count: state.todo.length })}
        </p>
      ) : null}
    </div>
  );
}
