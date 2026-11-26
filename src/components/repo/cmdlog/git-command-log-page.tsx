import { AppHeader } from '@/components/app/app-header';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toastError } from '@/lib/error-toast';
import { formatDate } from '@/lib/format';
import {
  subscribeGitCommandLog,
  useGitCommandLog,
} from '@/lib/git-command-log-store';
import {
  filterCommandLog,
  formatDurationMs,
  formatGitCommand,
  type GitCommandEntry,
} from '@/lib/git-command-log';
import { repoLabel } from '@/lib/repo-store';
import { cn } from '@/lib/utils';
import {
  Check,
  Copy,
  Loader2,
  RefreshCw,
  ScrollText,
  Trash2,
  X,
} from 'lucide-react';
import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { copyText } from '@/lib/copy-text';
import { SpinIcon } from "@/components/motion/kit";
import { Pause as PauseData, Play as PlayData } from "lucide";
import { MorphIcon } from "@/components/ui/morph-icon";

const CommandRow = memo(function CommandRow({ entry }: { entry: GitCommandEntry }) {
  const { t, i18n } = useTranslation();
  const command = formatGitCommand(entry.args);

  return (
    <div className='flex items-center gap-2 rounded-lg border border-border/50 bg-card/40 px-2.5 py-1.5 transition-colors hover:border-border hover:bg-card/70'>
      <span
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-md',
          entry.exitOk
            ? 'bg-git-added/10 text-git-added'
            : 'bg-destructive/10 text-destructive',
        )}
        title={entry.exitOk ? t('cmdLog.exitOk') : t('cmdLog.exitFail')}
      >
        {entry.exitOk ? <Check className='size-3' /> : <X className='size-3' />}
      </span>
      <span
        className='w-28 shrink-0 truncate text-[0.6875rem] text-muted-foreground'
        title={entry.repoPath || t('cmdLog.noRepo')}
      >
        {entry.repoPath ? repoLabel(entry.repoPath) : t('cmdLog.noRepo')}
      </span>
      <code className='min-w-0 flex-1 truncate font-mono text-xs' title={command}>
        {command}
      </code>
      <span
        className='shrink-0 text-[0.6875rem] tabular-nums text-muted-foreground'
        title={formatDate(entry.startedAt)}
      >
        {formatDurationMs(entry.durationMs, i18n.language)}
      </span>
      <Button
        type='button'
        variant='ghost'
        size='icon-xs'
        className='shrink-0 text-muted-foreground'
        title={t('cmdLog.copyRow')}
        aria-label={t('cmdLog.copyRow')}
        onClick={() => void copyText(command, t('cmdLog.copied'), t('crash.copyFailed'))}
      >
        <Copy className='size-3.5' />
      </Button>
    </div>
  );
});

export function GitCommandLogPage({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const entries = useGitCommandLog((s) => s.entries);
  const loading = useGitCommandLog((s) => s.loading);
  const paused = useGitCommandLog((s) => s.paused);
  const load = useGitCommandLog((s) => s.load);
  const clear = useGitCommandLog((s) => s.clear);
  const setPaused = useGitCommandLog((s) => s.setPaused);
  const [filter, setFilter] = useState('');
  const [clearOpen, setClearOpen] = useState(false);

  useEffect(() => subscribeGitCommandLog(error => toastError(String(error))), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !e.isComposing && !clearOpen) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, clearOpen]);

  const visible = useMemo(() => filterCommandLog(entries, filter), [entries, filter]);

  return (
    <div className='fixed inset-0 z-50 flex flex-col bg-background'>
      <AppHeader />
      <div className='flex min-h-0 flex-1 flex-col'>
        <div className='flex shrink-0 items-center gap-2 border-b border-border/40 px-4 py-2.5'>
          <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary'>
            <ScrollText className='h-4 w-4' />
          </div>
          <div className='min-w-0'>
            <h2 className='truncate text-sm font-semibold tracking-tight'>
              {t('cmdLog.title')}
            </h2>
            <p className='truncate text-[0.6875rem] text-muted-foreground'>
              {t('cmdLog.subtitle', { count: visible.length })}
            </p>
          </div>
          <div className='ml-auto flex shrink-0 items-center gap-1'>
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={e => {
                if (e.key !== 'Escape' || e.nativeEvent.isComposing || !filter) return;
                e.preventDefault();
                e.stopPropagation();
                setFilter('');
              }}
              aria-label={t('cmdLog.filterPlaceholder')}
              placeholder={t('cmdLog.filterPlaceholder')}
              spellCheck={false}
              className='h-8 w-52'
            />
            <Button
              type='button'
              variant='ghost'
              size='icon-sm'
              title={paused ? t('cmdLog.resume') : t('cmdLog.pause')}
              aria-label={paused ? t('cmdLog.resume') : t('cmdLog.pause')}
              onClick={() => void setPaused(!paused).catch(e => toastError(String(e)))}
            >
              <MorphIcon icon={paused ? PlayData : PauseData} className='size-4' />
            </Button>
            <Button
              type='button'
              variant='ghost'
              size='icon-sm'
              title={t('cmdLog.refresh')}
              aria-label={t('cmdLog.refresh')}
              disabled={loading}
              onClick={() => void load().catch((e) => toastError(String(e)))}
            >
              <SpinIcon icon={RefreshCw} active={loading} className='size-4' />
            </Button>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              className='gap-1.5 text-muted-foreground hover:text-destructive'
              onClick={() => setClearOpen(true)}
            >
              <Trash2 className='size-3.5' />
              {t('cmdLog.clear')}
            </Button>
            <Button
              type='button'
              variant='ghost'
              size='icon-sm'
              title={t('common.close')}
              aria-label={t('common.close')}
              onClick={onClose}
            >
              <X className='size-4' />
            </Button>
          </div>
        </div>

        <div className='min-h-0 flex-1 overflow-y-auto px-4 py-3'>
          {entries.length === 0 && loading ? (
            <div className='flex items-center justify-center gap-2 py-16 text-muted-foreground'>
              <SpinIcon icon={Loader2} className='size-4 ' />
              <span className='text-sm'>{t('common.loading')}</span>
            </div>
          ) : visible.length === 0 ? (
            <div className='flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground'>
              <ScrollText className='size-10 opacity-20' />
              <span className='text-sm font-medium'>{t(entries.length ? 'common.noResults' : 'cmdLog.empty')}</span>
              {entries.length ? (
                <Button variant="outline" size="sm" onClick={() => setFilter('')}>{t('cmdLog.resetFilter')}</Button>
              ) : <span className='max-w-sm text-xs opacity-80'>{t('cmdLog.emptyHint')}</span>}
            </div>
          ) : (
            <div className='mx-auto flex w-full max-w-5xl flex-col gap-1'>
              {visible.map((entry) => (
                <CommandRow key={entry.seq} entry={entry} />
              ))}
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('cmdLog.clearConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('cmdLog.clearConfirmDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={() => {
                void clear().catch((e) => toastError(String(e)));
                setClearOpen(false);
              }}
            >
              {t('cmdLog.clear')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
