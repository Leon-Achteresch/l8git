import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { RecoveryFeedback } from '@/components/repo/undo/recovery-feedback';
import { recoveryError, undoDescriptionKey, type UndoPreview } from '@/lib/reflog-format';
import { useReflogStore } from '@/lib/reflog-store';
import { useUiStore } from '@/lib/ui-store';
import { Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { SpinIcon } from '@/components/motion/kit';

export function UndoConfirmDialog({ open, path, onClose }: { open: boolean; path: string; onClose: () => void }) {
  const { t } = useTranslation();
  const undoPreview = useReflogStore((state) => state.undoPreview);
  const undoLast = useReflogStore((state) => state.undoLast);
  const [previewData, setPreviewData] = useState<{ path: string; data: UndoPreview } | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const epoch = useRef(0);
  const active = useRef({ open, path });
  active.current = { open, path };
  const preview = previewData?.path === path ? previewData.data : null;

  useEffect(() => {
    const request = ++epoch.current;
    setPreviewData(null);
    setError(null);
    setBusy(false);
    setLoading(open);
    if (!open) return;
    undoPreview(path)
      .then((data) => { if (epoch.current === request) setPreviewData({ path, data }); })
      .catch((cause) => { if (epoch.current === request) setError(String(cause)); })
      .finally(() => { if (epoch.current === request) setLoading(false); });
    return () => { if (epoch.current === request) epoch.current++; };
  }, [open, path, revision, undoPreview]);

  async function confirm() {
    if (busy || loading || !preview?.supported || !preview.snapshot) return;
    const request = epoch.current;
    const operationPath = path;
    const snapshot = preview.snapshot;
    setBusy(true);
    setError(null);
    try {
      const result = await undoLast(operationPath, snapshot);
      toast.success(t('undo.successToast', { action: result.undone_action, hash: result.to_hash.slice(0, 7) }));
      if (useReflogStore.getState().refreshWarning[operationPath]) toast.warning(t('recovery.refreshWarning'));
      if (epoch.current === request && active.current.open && active.current.path === operationPath) onClose();
    } catch (cause) {
      if (epoch.current !== request) return;
      const message = String(cause);
      setError(message);
      if (recoveryError(message).stale) setPreviewData(null);
    } finally {
      if (epoch.current === request) setBusy(false);
    }
  }

  return <AlertDialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{t('undo.dialogTitle')}</AlertDialogTitle>
        <AlertDialogDescription>
          {loading ? <span className='flex items-center gap-2'><SpinIcon icon={Loader2} active className='size-3.5' />{t('undo.previewLoading')}</span>
            : preview?.supported ? <span className='flex flex-col gap-2'>
              <span>{t('undo.dialogDesc', { action: t(undoDescriptionKey(preview.description_key)), hash: preview.target_short_hash })}</span>
              {preview.target_subject && <span className='break-words font-mono text-xs text-foreground/80'>{preview.target_subject}</span>}
              <span className='font-mono text-xs'>{preview.head_name || t('recovery.detachedHead')}: {preview.current_short_hash} → {preview.target_short_hash}</span>
              <span className='text-xs'>{t(preview.mode === 'soft' ? 'recovery.softEffect' : 'recovery.keepEffect')}</span>
            </span>
              : preview ? t('undo.unsupportedToast', { action: preview.action })
                : t('recovery.previewRequired')}
        </AlertDialogDescription>
      </AlertDialogHeader>
      {error && <RecoveryFeedback error={error} />}
      <AlertDialogFooter className='flex-wrap'>
        {preview && !preview.supported && <Button variant='outline' onClick={() => { onClose(); useUiStore.getState().openReflogView(path); }}>{t('recovery.openReflog')}</Button>}
        <Button variant='ghost' disabled={busy || loading} onClick={() => setRevision((value) => value + 1)}><RefreshCw className='size-3.5' />{t('recovery.reloadPreview')}</Button>
        <AlertDialogCancel disabled={busy}>{t('common.cancel')}</AlertDialogCancel>
        <AlertDialogAction disabled={busy || loading || !preview?.supported || !preview.snapshot} onClick={(event) => { event.preventDefault(); void confirm(); }}>
          {busy ? t('undo.busy') : t('undo.confirmVerb')}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
