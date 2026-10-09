import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RecoveryFeedback } from '@/components/repo/undo/recovery-feedback';
import { useReflogStore } from '@/lib/reflog-store';
import type { ReflogEntry, RestoredBranch } from '@/lib/reflog-format';
import { GitBranch, Loader2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { SpinIcon } from '@/components/motion/kit';

export function RescueBranchDialog({ path, entry, onClose }: { path: string; entry: ReflogEntry | null; onClose: () => void }) {
  const { t } = useTranslation();
  const inputId = useId();
  const [draft, setDraft] = useState({ key: '', name: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const epoch = useRef(0);
  const key = JSON.stringify([path, entry?.hash, entry?.selector]);
  const activeKey = useRef(key);
  activeKey.current = key;
  const name = draft.key === key ? draft.name : `rescue/${entry?.short_hash ?? ''}`;
  useEffect(() => {
    epoch.current++;
    setError(null);
    setBusy(false);
    setDraft({ key, name: `rescue/${entry?.short_hash ?? ''}` });
    return () => { epoch.current++; };
  }, [key, entry?.short_hash]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!entry || busy || !name.trim()) return;
    const request = epoch.current;
    const operationPath = path;
    const operationKey = key;
    const targetHash = entry.hash;
    setBusy(true);
    setError(null);
    try {
      const branch = await invoke<RestoredBranch>('branch_restore', { path: operationPath, name: name.trim(), hash: targetHash });
      // Branch creation completed. A failed UI refresh must not invite a second creation.
      await useReflogStore.getState().refreshViews(operationPath);
      toast.success(t('recovery.branchCreated', { name: branch.name, hash: branch.short_hash }));
      if (useReflogStore.getState().refreshWarning[operationPath]) toast.warning(t('recovery.refreshWarning'));
      if (epoch.current === request && activeKey.current === operationKey) onClose();
    } catch (cause) {
      if (epoch.current === request && activeKey.current === operationKey) setError(String(cause));
    } finally {
      if (epoch.current === request && activeKey.current === operationKey) setBusy(false);
    }
  }

  return <Dialog open={!!entry} onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent showCloseButton={!busy}>
      <DialogHeader>
        <DialogTitle className='flex items-center gap-2'><GitBranch className='size-4 text-primary' />{t('recovery.rescueTitle')}</DialogTitle>
        <DialogDescription>{t('recovery.rescueDescription')}</DialogDescription>
      </DialogHeader>
      <form onSubmit={(event) => void submit(event)} className='grid gap-3'>
        {entry && <div className='space-y-1 rounded-md border border-border/50 bg-muted/30 p-2 text-xs'>
          <p className='break-words font-medium'>{entry.message || entry.subject}</p>
          <p className='break-all font-mono text-muted-foreground'>{entry.hash}</p>
        </div>}
        <div className='space-y-1.5'>
          <Label htmlFor={inputId}>{t('recovery.branchName')}</Label>
          <Input id={inputId} autoFocus autoComplete='off' spellCheck={false} value={name} disabled={busy} onChange={(event) => setDraft({ key, name: event.target.value })} required />
        </div>
        {error && <RecoveryFeedback error={error} />}
        <DialogFooter>
          <Button type='button' variant='ghost' disabled={busy} onClick={onClose}>{t('common.cancel')}</Button>
          <Button type='submit' disabled={busy || !name.trim()}>{busy && <SpinIcon icon={Loader2} active className='size-3.5' />}{t('recovery.createBranch')}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
