import { useState } from 'react';
import { Activity, History, ScrollText, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { UndoConfirmDialog } from '@/components/repo/undo/undo-confirm-dialog';
import { cancelRemoteOp, useRemoteOps } from '@/lib/remote-ops';
import { useRepoStore, repoLabel } from '@/lib/repo-store';
import { useUiStore } from '@/lib/ui-store';
import { useInboxStore } from '@/lib/inbox-store';
import { useInboxPaths } from '@/components/inbox/use-inbox-paths';
import { toastError } from '@/lib/error-toast';
import { WorkspaceFetchPreview } from '@/components/app/workspace-fetch-preview';

export function ActivityCenter() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [undoPath, setUndoPath] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const path = useRepoStore(s => s.activePath);
  const ops = useRemoteOps(s => s.ops);
  const history = useRemoteOps(s => s.history);
  const errors = useInboxStore(s => s.errors);
  const nextRefreshAt = useInboxStore(s => s.nextRefreshAt);
  const refreshing = useInboxStore(s => s.loading);
  const paths = useInboxPaths();
  const count = ops.length + history.filter(op => op.status === 'failed').length + errors.length;
  return <>
    <Button variant="ghost" size="icon" className="relative size-7" aria-label={t('audit.activity')} title={t('audit.activity')} onClick={() => setOpen(true)}>
      <Activity className="size-4" />
      {count > 0 && <span className="absolute right-0 top-0 size-1.5 rounded-full bg-primary" />}
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{t('audit.activity')}</DialogTitle><DialogDescription>{t('audit.activityHint')}</DialogDescription></DialogHeader>
        {open && <WorkspaceFetchPreview />}
        {path && <section className="rounded-lg border p-3">
          <h3 className="text-sm font-semibold">{t('audit.recovery')} · {repoLabel(path)}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t('audit.recoveryHint')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => { setOpen(false); setUndoPath(path); }}><Undo2 className="size-4" />{t('undo.buttonLabel')}</Button>
            <Button size="sm" variant="outline" onClick={() => { setOpen(false); useUiStore.getState().openReflogView(path); }}><History className="size-4" />{t('audit.reflog')}</Button>
          </div>
        </section>}
        <Button size="sm" variant="outline" onClick={() => { setOpen(false); useUiStore.getState().openCommandLog(); }}><ScrollText className="size-4" />{t('audit.commands')}</Button>
        {ops.map(op => <div key={op.opId} role="status" className="rounded-lg border p-3 text-sm">
          <div className="flex items-center justify-between gap-2"><strong>{t(`remoteProgress.op_${op.op}`)} · {repoLabel(op.repoPath)}</strong><Button variant="outline" size="sm" disabled={op.canceling} onClick={() => void cancelRemoteOp(op.opId)}>{t('common.cancel')}</Button></div>
          <p className="mt-1 text-xs text-muted-foreground">{op.phase || t('common.loading')} {op.percent === null ? '' : `${Math.round(op.percent)}%`}</p>
        </div>)}
        {errors.length > 0 && <section className="rounded-lg border border-destructive/30 p-3">
          {errors.map(error => <p key={error.path} className="mb-2 break-words text-xs"><strong>{error.repoName}</strong>: {error.message}</p>)}
          {nextRefreshAt && <p className="mb-2 text-xs text-muted-foreground">{t('audit.nextRetry', { time: new Date(nextRefreshAt).toLocaleTimeString() })}</p>}
          <Button size="sm" variant="outline" disabled={refreshing} onClick={() => void useInboxStore.getState().refresh(paths).catch(toastError)}>{t('audit.retry')}</Button>
        </section>}
        {history.length === 0 && ops.length === 0 && <p className="text-sm text-muted-foreground">{t('audit.noActivity')}</p>}
        {history.map(op => <div key={op.opId} className="rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><strong>{t(`remoteProgress.op_${op.op}`)} · {repoLabel(op.repoPath)}</strong><span className={op.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>{t(`audit.status_${op.status}`)}</span></div>
          <time className="text-xs text-muted-foreground" dateTime={new Date(op.finishedAt).toISOString()}>{new Date(op.finishedAt).toLocaleTimeString()}</time>
          {op.message && <p className="mt-1 whitespace-pre-wrap break-words text-xs">{op.message}</p>}
          {op.status === 'failed' && op.retry && <Button className="mt-2" size="sm" variant="outline" disabled={retrying !== null} onClick={async () => { setRetrying(op.opId); try { await op.retry?.(); } catch (error) { toastError(String(error)); } finally { setRetrying(null); } }}>{t('audit.retry')}</Button>}
        </div>)}
      </DialogContent>
    </Dialog>
    {undoPath && <UndoConfirmDialog open path={undoPath} onClose={() => setUndoPath(null)} />}
  </>;
}
