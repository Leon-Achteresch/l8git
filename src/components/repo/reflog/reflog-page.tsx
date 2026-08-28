import { AppHeader } from '@/components/app/app-header';
import { ReflogRow } from '@/components/repo/reflog/reflog-row';
import { UndoConfirmDialog } from '@/components/repo/undo/undo-confirm-dialog';
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
import { toastError } from '@/lib/error-toast';
import { repoLabel } from '@/lib/repo-store';
import type { ReflogEntry, ReflogResetMode } from '@/lib/reflog-format';
import { useReflogStore } from '@/lib/reflog-store';
import { History, Loader2, RefreshCw, Undo2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { SpinIcon } from "@/components/motion/kit";

const EMPTY_ENTRIES: ReflogEntry[] = [];

type PendingReset = { entry: ReflogEntry; mode: ReflogResetMode };

export function ReflogPage({
  path,
  onClose,
}: {
  path: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const entries = useReflogStore((s) => s.entries[path] ?? EMPTY_ENTRIES);
  const loading = useReflogStore((s) => !!s.loading[path]);
  const exhausted = useReflogStore((s) => !!s.exhausted[path]);
  const error = useReflogStore((s) => s.error[path] ?? null);
  const load = useReflogStore((s) => s.load);
  const loadMore = useReflogStore((s) => s.loadMore);
  const resetToEntry = useReflogStore((s) => s.resetToEntry);
  const [pending, setPending] = useState<PendingReset | null>(null);
  const [busy, setBusy] = useState(false);
  const [undoOpen, setUndoOpen] = useState(false);

  useEffect(() => {
    void load(path);
  }, [path, load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending && !undoOpen) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, pending, undoOpen]);

  async function copyHash(hash: string) {
    try {
      await navigator.clipboard?.writeText(hash);
      toast.success(t('reflog.hashCopied'));
    } catch (e) {
      toastError(String(e));
    }
  }

  async function confirmReset() {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const result = await resetToEntry(
        path,
        pending.entry.selector,
        pending.mode,
      );
      toast.success(
        t('reflog.resetSuccess', {
          selector: pending.entry.selector,
          hash: result.to_hash.slice(0, 7),
        }),
      );
      setPending(null);
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const hard = pending?.mode === 'hard';

  return (
    <div className='fixed inset-0 z-50 flex flex-col bg-background'>
      <AppHeader />
      <div className='flex min-h-0 flex-1 flex-col'>
        <div className='flex shrink-0 items-center gap-2 border-b border-border/40 px-4 py-2.5'>
          <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary'>
            <History className='h-4 w-4' />
          </div>
          <div className='min-w-0'>
            <h2 className='truncate text-sm font-semibold tracking-tight'>
              {t('reflog.title')}
            </h2>
            <p className='truncate text-[11px] text-muted-foreground'>
              {t('reflog.subtitle', {
                repo: repoLabel(path),
                count: entries.length,
              })}
            </p>
          </div>
          <div className='ml-auto flex shrink-0 items-center gap-1'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              className='gap-1.5'
              onClick={() => setUndoOpen(true)}
            >
              <Undo2 className='size-3.5' />
              {t('undo.buttonLabel')}
            </Button>
            <Button
              type='button'
              variant='ghost'
              size='icon-sm'
              title={t('reflog.refresh')}
              aria-label={t('reflog.refresh')}
              disabled={loading}
              onClick={() => void load(path)}
            >
              <SpinIcon icon={RefreshCw} active={loading} className='size-4' />
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
          {error ? (
            <p className='rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive'>
              {error}
            </p>
          ) : entries.length === 0 && loading ? (
            <div className='flex items-center justify-center gap-2 py-16 text-muted-foreground'>
              <SpinIcon icon={Loader2} className='size-4 ' />
              <span className='text-sm'>{t('reflog.loading')}</span>
            </div>
          ) : entries.length === 0 ? (
            <div className='flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground'>
              <History className='size-10 opacity-20' />
              <span className='text-sm font-medium'>{t('reflog.empty')}</span>
              <span className='max-w-sm text-xs opacity-80'>
                {t('reflog.emptyHint')}
              </span>
            </div>
          ) : (
            <div className='mx-auto flex w-full max-w-5xl flex-col gap-1'>
              {entries.map((entry) => (
                <ReflogRow
                  key={entry.selector}
                  entry={entry}
                  onCopyHash={(hash) => void copyHash(hash)}
                  onResetKeep={(e) => setPending({ entry: e, mode: 'keep' })}
                  onResetHard={(e) => setPending({ entry: e, mode: 'hard' })}
                />
              ))}
              {!exhausted && (
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  className='mt-2 self-center'
                  disabled={loading}
                  onClick={() => void loadMore(path)}
                >
                  {loading ? (
                    <SpinIcon icon={Loader2} className='size-3.5 ' />
                  ) : null}
                  {t('reflog.loadMore')}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <AlertDialog
        open={!!pending}
        onOpenChange={(next) => {
          if (!next && !busy) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {hard ? t('reflog.confirmHardTitle') : t('reflog.confirmKeepTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {hard
                ? t('reflog.confirmHardDesc', {
                    selector: pending?.entry.selector ?? '',
                    hash: pending?.entry.short_hash ?? '',
                  })
                : t('reflog.confirmKeepDesc', {
                    selector: pending?.entry.selector ?? '',
                    hash: pending?.entry.short_hash ?? '',
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant={hard ? 'destructive' : 'default'}
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void confirmReset();
              }}
            >
              {hard ? t('reflog.resetHardVerb') : t('reflog.resetKeepVerb')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UndoConfirmDialog
        open={undoOpen}
        path={path}
        onClose={() => setUndoOpen(false)}
      />
    </div>
  );
}
