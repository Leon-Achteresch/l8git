import { AppHeader } from '@/components/app/app-header';
import { ReflogRow } from '@/components/repo/reflog/reflog-row';
import { RescueBranchDialog } from '@/components/repo/reflog/rescue-branch-dialog';
import { UndoConfirmDialog } from '@/components/repo/undo/undo-confirm-dialog';
import { RecoveryFeedback } from '@/components/repo/undo/recovery-feedback';
import { WorkflowHelpLink } from '@/components/help/workflow-help-link';
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toastError } from '@/lib/error-toast';
import { repoLabel } from '@/lib/repo-store';
import { recoveryError, type ReflogEntry, type ReflogResetMode } from '@/lib/reflog-format';
import { useReflogStore } from '@/lib/reflog-store';
import { GitBranch, History, Loader2, RefreshCw, Undo2, X } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { SpinIcon } from "@/components/motion/kit";

const EMPTY_ENTRIES: ReflogEntry[] = [];
const CommitInspectDetail = lazy(() => import('@/components/repo/commit/commit-inspect-detail').then((module) => ({ default: module.CommitInspectDetail })));
type SelectedEntry = { path: string; entry: ReflogEntry };

type PendingReset = { path: string; entry: ReflogEntry; mode: ReflogResetMode; expectedHead: string };

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
  const refreshViews = useReflogStore((s) => s.refreshViews);
  const resetToEntry = useReflogStore((s) => s.resetToEntry);
  const [pending, setPending] = useState<PendingReset | null>(null);
  const [busy, setBusy] = useState(false);
  const [undoOpen, setUndoOpen] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [inspect, setInspect] = useState<SelectedEntry | null>(null);
  const [rescue, setRescue] = useState<SelectedEntry | null>(null);
  const refreshWarning = useReflogStore((s) => !!s.refreshWarning[path]);
  const activePath = useRef(path);
  const pathEpoch = useRef(0);
  activePath.current = path;
  const visiblePending = pending?.path === path ? pending : null;
  const visibleInspect = inspect?.path === path ? inspect : null;
  const visibleRescue = rescue?.path === path ? rescue : null;

  useEffect(() => {
    pathEpoch.current++;
    setPending(null);
    setResetError(null);
    setBusy(false);
    setUndoOpen(false);
    setInspect(null);
    setRescue(null);
    void load(path);
  }, [path, load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending && !undoOpen && !document.querySelector('[role="dialog"], [role="alertdialog"]') && !(e.target instanceof Element && e.target.closest('input, textarea, [contenteditable="true"]'))) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, pending, undoOpen]);

  async function copyHash(hash: string) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error(t('recovery.clipboardUnavailable'));
      await navigator.clipboard.writeText(hash);
      toast.success(t('reflog.hashCopied'));
    } catch (e) {
      toastError(String(e));
    }
  }

  async function confirmReset() {
    if (!visiblePending || busy || (resetError && recoveryError(resetError).stale)) return;
    const operation = visiblePending;
    const operationEpoch = pathEpoch.current;
    setBusy(true);
    setResetError(null);
    try {
      const result = await resetToEntry(
        operation.path,
        operation.entry.selector,
        operation.mode,
        operation.entry.hash,
        operation.expectedHead,
      );
      toast.success(
        t('reflog.resetSuccess', {
          selector: operation.entry.selector,
          hash: result.to_hash.slice(0, 7),
        }),
      );
      if (activePath.current === operation.path && pathEpoch.current === operationEpoch) setPending(null);
      if (useReflogStore.getState().refreshWarning[operation.path]) toast.warning(t('recovery.refreshWarning'));
    } catch (e) {
      if (activePath.current === operation.path && pathEpoch.current === operationEpoch) setResetError(String(e));
    } finally {
      if (activePath.current === operation.path && pathEpoch.current === operationEpoch) setBusy(false);
    }
  }

  function requestReset(entry: ReflogEntry, mode: ReflogResetMode) {
    const currentHead = entries[0]?.hash;
    if (!currentHead) return;
    setResetError(null);
    setPending({ path, entry, mode, expectedHead: currentHead });
  }

  const hard = visiblePending?.mode === 'hard';

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
            <p className='truncate text-[0.6875rem] text-muted-foreground'>
              {t('reflog.subtitle', {
                repo: repoLabel(path),
                count: entries.length,
              })}
            </p>
          </div>
          <div className='ml-auto flex shrink-0 items-center gap-1'>
            <WorkflowHelpLink guideId='recover-history' onOpen={onClose} />
            <Button
              type='button'
              variant='outline'
              size='sm'
              className='gap-1.5'
              aria-label={t('undo.buttonLabel')}
              onClick={() => setUndoOpen(true)}
            >
              <Undo2 className='size-3.5' />
              <span className='hidden sm:inline'>{t('undo.buttonLabel')}</span>
            </Button>
            <Button
              type='button'
              variant='ghost'
              size='icon-sm'
              title={t('reflog.refresh')}
              aria-label={t('reflog.refresh')}
              disabled={loading}
              onClick={() => void (refreshWarning ? refreshViews(path) : load(path))}
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
          <p className='mx-auto mb-3 max-w-5xl text-xs leading-relaxed text-muted-foreground'>{t('recovery.reflogHint')}</p>
          {refreshWarning && <div role='status' className='mx-auto mb-3 flex max-w-5xl items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs'>
            <p>{t('recovery.refreshWarning')}</p>
            <Button variant='outline' size='sm' disabled={loading} onClick={() => void refreshViews(path)}>{t('recovery.refreshViews')}</Button>
          </div>}
          {error ? (
            <div role='alert' className='rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive'>
              <p className='whitespace-pre-wrap break-all'>{error}</p>
              <Button variant='outline' size='sm' className='mt-2' disabled={loading} onClick={() => void load(path)}>{t('common.retry')}</Button>
            </div>
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
                  onResetKeep={(e) => requestReset(e, 'keep')}
                  onResetHard={(e) => requestReset(e, 'hard')}
                  onInspect={(entry) => setInspect({ path, entry })}
                  onCreateBranch={(entry) => setRescue({ path, entry })}
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
        open={!!visiblePending}
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
                    selector: visiblePending?.entry.selector ?? '',
                    hash: visiblePending?.entry.short_hash ?? '',
                  })
                : t('reflog.confirmKeepDesc', {
                    selector: visiblePending?.entry.selector ?? '',
                    hash: visiblePending?.entry.short_hash ?? '',
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {visiblePending && <div className='space-y-2 rounded-lg border border-border/50 bg-muted/30 p-3 text-xs'>
            <p className='break-words font-medium'>{visiblePending.entry.message || visiblePending.entry.subject}</p>
            <p className='font-mono break-all'>{t('recovery.currentHead')}: {visiblePending.expectedHead}</p>
            <p className='font-mono break-all'>{t('recovery.targetCommit')}: {visiblePending.entry.hash}</p>
            <p className='text-muted-foreground'>{t(hard ? 'recovery.hardEffect' : 'recovery.keepEffect')}</p>
          </div>}
          {resetError && <RecoveryFeedback error={resetError} />}
          <AlertDialogFooter>
            {resetError && recoveryError(resetError).stale && <Button variant='outline' onClick={() => { setPending(null); setResetError(null); void load(path); }}>{t('recovery.reloadReflog')}</Button>}
            <AlertDialogCancel disabled={busy}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant={hard ? 'destructive' : 'default'}
              disabled={busy || !visiblePending || !!(resetError && recoveryError(resetError).stale)}
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
      <Dialog open={!!visibleInspect} onOpenChange={(open) => { if (!open) setInspect(null); }}>
        <DialogContent showCloseButton={false} className='flex h-[90dvh] w-[calc(100vw-1.5rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl'>
          <DialogHeader className='shrink-0 border-b border-border/50 px-4 py-3'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <DialogTitle>{t('recovery.inspectTitle')}</DialogTitle>
              <Button variant='outline' size='sm' onClick={() => { if (visibleInspect) { setRescue(visibleInspect); setInspect(null); } }}><GitBranch className='size-3.5' />{t('recovery.createBranch')}</Button>
            </div>
            <DialogDescription className='break-all font-mono text-xs'>{visibleInspect?.entry.hash}</DialogDescription>
          </DialogHeader>
          <div className='min-h-0 flex-1'>
            {visibleInspect && <Suspense fallback={<div className='grid h-full place-items-center'><SpinIcon icon={Loader2} active className='size-5' /></div>}>
              <CommitInspectDetail path={visibleInspect.path} commitHash={visibleInspect.entry.hash} readOnly onClose={() => setInspect(null)} />
            </Suspense>}
          </div>
        </DialogContent>
      </Dialog>
      <RescueBranchDialog path={visibleRescue?.path ?? path} entry={visibleRescue?.entry ?? null} onClose={() => setRescue(null)} />
    </div>
  );
}
