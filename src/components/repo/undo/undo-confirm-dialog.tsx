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
import { toastError } from '@/lib/error-toast';
import {
  parseUndoUnsupported,
  undoDescriptionKey,
  type UndoPreview,
} from '@/lib/reflog-format';
import { useReflogStore } from '@/lib/reflog-store';
import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

export function UndoConfirmDialog({
  open,
  path,
  onClose,
}: {
  open: boolean;
  path: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const undoPreview = useReflogStore((s) => s.undoPreview);
  const undoLast = useReflogStore((s) => s.undoLast);
  const [preview, setPreview] = useState<UndoPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const close = useCallback(() => closeRef.current(), []);

  useEffect(() => {
    if (!open) {
      setPreview(null);
      setBusy(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setPreview(null);
    undoPreview(path)
      .then((next) => {
        if (cancelled) return;
        if (!next.supported) {
          toast.info(t('undo.unsupportedToast', { action: next.action }));
          close();
          return;
        }
        setPreview(next);
      })
      .catch((e) => {
        if (cancelled) return;
        const unsupported = parseUndoUnsupported(e);
        if (unsupported) {
          toast.info(t('undo.unsupportedToast', { action: unsupported }));
        } else {
          toastError(String(e));
        }
        close();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, path, undoPreview, close, t]);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await undoLast(path);
      toast.success(
        t('undo.successToast', {
          action: result.undone_action,
          hash: result.to_hash.slice(0, 7),
        }),
      );
      onClose();
    } catch (e) {
      const unsupported = parseUndoUnsupported(e);
      if (unsupported) {
        toast.info(t('undo.unsupportedToast', { action: unsupported }));
      } else {
        toastError(String(e));
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('undo.dialogTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {loading || !preview ? (
              <span className='flex items-center gap-2'>
                <Loader2 className='size-3.5 animate-spin' />
                {t('undo.previewLoading')}
              </span>
            ) : (
              <span className='flex flex-col gap-1'>
                <span>
                  {t('undo.dialogDesc', {
                    action: t(undoDescriptionKey(preview.description_key)),
                    hash: preview.target_short_hash,
                  })}
                </span>
                {preview.target_subject ? (
                  <span className='truncate font-mono text-xs text-foreground/80'>
                    {preview.target_subject}
                  </span>
                ) : null}
                <span className='text-xs'>{t('undo.dialogHint')}</span>
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>
            {t('common.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={busy || loading || !preview}
            onClick={(e) => {
              e.preventDefault();
              void confirm();
            }}
          >
            {busy ? t('undo.busy') : t('undo.confirmVerb')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
