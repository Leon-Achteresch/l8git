import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { RebaseCommit } from '@/lib/repo-store';
import { useRepoStore } from '@/lib/repo-store';
import { cn } from '@/lib/utils';
import { AlertTriangle, GitBranchPlus, Loader2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { notifyRebaseResult } from './rebase-feedback';
import { describeRebaseError, isLocalChangesBlock } from './rebase-errors';
import { SpinIcon } from "@/components/motion/kit";

const CUSTOM_REF = '__custom__';

export function RebaseDialog({
  open,
  onClose,
  path,
  upstream,
}: {
  open: boolean;
  onClose: () => void;
  path: string;
  upstream?: string;
}) {
  const { t } = useTranslation();
  const rebaseStart = useRepoStore(s => s.rebaseStart);
  const rebaseTodoPreview = useRepoStore(s => s.rebaseTodoPreview);
  const currentBranch = useRepoStore(s => s.repos[path]?.branch ?? '');
  const branches = useRepoStore(s => s.repos[path]?.branches);
  const rebaseInProgress = useRepoStore(
    s => s.rebaseState[path]?.in_progress ?? false
  );

  const [selected, setSelected] = useState('');
  const [customRef, setCustomRef] = useState('');
  const [useOnto, setUseOnto] = useState(false);
  const [onto, setOnto] = useState('');
  const [autostash, setAutostash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<RebaseCommit[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const previewToken = useRef(0);
  const branchesRef = useRef(branches);
  branchesRef.current = branches;

  const selectableBranches = useMemo(
    () => (branches ?? []).filter(b => !b.is_current),
    [branches]
  );

  const target = selected === CUSTOM_REF ? customRef.trim() : selected.trim();

  useEffect(() => {
    if (!open) {
      setBusy(false);
      setError(null);
      setPreview(null);
      setPreviewError(false);
      return;
    }
    const initial = upstream?.trim() ?? '';
    const known = (branchesRef.current ?? []).some(b => b.name === initial);
    setSelected(initial ? (known ? initial : CUSTOM_REF) : '');
    setCustomRef(initial && !known ? initial : '');
    setUseOnto(false);
    setOnto('');
    setAutostash(false);
    setError(null);
    setPreview(null);
    setPreviewError(false);
  }, [open, upstream]);

  useEffect(() => {
    if (!open || !target) {
      setPreview(null);
      setPreviewError(false);
      setPreviewLoading(false);
      return;
    }
    const token = ++previewToken.current;
    setPreviewLoading(true);
    setPreviewError(false);
    const handle = window.setTimeout(() => {
      rebaseTodoPreview(path, target)
        .then(list => {
          if (previewToken.current !== token) return;
          setPreview(list);
          setPreviewLoading(false);
        })
        .catch(() => {
          if (previewToken.current !== token) return;
          setPreview(null);
          setPreviewError(true);
          setPreviewLoading(false);
        });
    }, 250);
    return () => window.clearTimeout(handle);
  }, [open, target, path, rebaseTodoPreview]);

  function dismiss() {
    if (busy) return;
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const res = await rebaseStart(path, target, {
        onto: useOnto ? onto.trim() || null : null,
        autostash,
      });
      notifyRebaseResult(path, res);
      onClose();
    } catch (err) {
      setError(describeRebaseError(err));
      if (isLocalChangesBlock(err)) setAutostash(true);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const previewCount = preview?.length ?? 0;

  return (
    <div
      role='dialog'
      aria-modal='true'
      aria-label={t('rebase.dialogAria')}
      className='fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4'
      onClick={dismiss}
    >
      <div
        className='w-full max-w-lg rounded-xl border border-border bg-card p-4 shadow-xl'
        onClick={e => e.stopPropagation()}
      >
        <header className='mb-3 flex items-center justify-between gap-2'>
          <h2 className='flex items-center gap-2 font-heading text-base font-medium'>
            <GitBranchPlus className='h-4 w-4' />
            {t('rebase.title')}
          </h2>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            onClick={dismiss}
            disabled={busy}
            aria-label={t('dialogs.closeAria')}
          >
            <X className='h-4 w-4' />
          </Button>
        </header>

        <p className='mb-3 truncate text-xs text-muted-foreground'>
          <span className='font-mono text-foreground'>
            {currentBranch || t('rebase.headFallback')}
          </span>{' '}
          →{' '}
          <span className='font-mono text-foreground'>
            {target || t('rebase.targetUnset')}
          </span>
        </p>

        {rebaseInProgress ? (
          <p className='mb-3 flex items-start gap-2 rounded-md border border-git-modified/40 bg-git-modified/10 p-2 text-xs'>
            <AlertTriangle className='mt-0.5 h-3.5 w-3.5 shrink-0 text-git-modified' />
            {t('rebase.errors.alreadyInProgress')}
          </p>
        ) : null}

        <form onSubmit={e => void submit(e)} className='grid gap-3'>
          <div className='grid gap-1'>
            <Label htmlFor='rebase-target'>{t('rebase.targetLabel')}</Label>
            <Select
              value={selected || '__none__'}
              onValueChange={value => setSelected(value === '__none__' ? '' : value)}
              disabled={busy}
            >
              <SelectTrigger id='rebase-target' className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='__none__'>
                  {t('rebase.targetUnset')}
                </SelectItem>
                {selectableBranches.map(b => (
                  <SelectItem key={b.name} value={b.name}>
                    {b.name}
                    {b.is_remote ? ` (${t('appSearch.badgeRemote')})` : ''}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM_REF}>
                  {t('rebase.customRefOption')}
                </SelectItem>
              </SelectContent>
            </Select>
            {selected === CUSTOM_REF ? (
              <Input
                value={customRef}
                onChange={e => setCustomRef(e.target.value)}
                placeholder={t('rebase.customRefPlaceholder')}
                spellCheck={false}
                disabled={busy}
                className='mt-1 font-mono text-xs'
              />
            ) : null}
            <p className='text-[11px] text-muted-foreground'>
              {t('rebase.targetHint')}
            </p>
          </div>

          <div className='grid gap-1 rounded-md border border-border bg-muted/20 p-2'>
            <div className='flex items-center justify-between gap-2'>
              <span className='text-xs font-medium text-muted-foreground'>
                {t('rebase.previewHeading')}
              </span>
              {previewLoading ? (
                <SpinIcon icon={Loader2} className='h-3.5 w-3.5 text-muted-foreground' />
              ) : preview ? (
                <span className='text-[11px] text-muted-foreground'>
                  {t('rebase.previewCount', { count: previewCount })}
                </span>
              ) : null}
            </div>
            {!target ? (
              <p className='text-[11px] text-muted-foreground'>
                {t('rebase.previewPickTarget')}
              </p>
            ) : previewError ? (
              <p className='text-[11px] text-muted-foreground'>
                {t('rebase.previewFailed')}
              </p>
            ) : preview && previewCount === 0 ? (
              <p className='text-[11px] text-muted-foreground'>
                {t('rebase.previewEmpty')}
              </p>
            ) : preview ? (
              <ul className='max-h-32 overflow-y-auto text-xs'>
                {preview.slice(0, 30).map(c => (
                  <li key={c.hash} className='flex items-baseline gap-2 py-0.5'>
                    <span className='shrink-0 font-mono text-[10px] text-muted-foreground'>
                      {c.short_hash}
                    </span>
                    <span className='min-w-0 flex-1 truncate' title={c.subject}>
                      {c.subject}
                    </span>
                  </li>
                ))}
                {previewCount > 30 ? (
                  <li className='py-0.5 text-[11px] text-muted-foreground'>
                    {t('rebase.previewMore', { count: previewCount - 30 })}
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>

          <label className='flex cursor-pointer items-start gap-2 text-sm'>
            <Checkbox
              checked={autostash}
              onCheckedChange={checked => setAutostash(checked === true)}
              disabled={busy}
              className='mt-0.5'
            />
            <span className='grid gap-0.5'>
              <span>{t('rebase.autostashLabel')}</span>
              <span className='text-[11px] text-muted-foreground'>
                {t('rebase.autostashHint')}
              </span>
            </span>
          </label>

          <div className='grid gap-1'>
            <label className='flex cursor-pointer items-center gap-2 text-sm'>
              <Checkbox
                checked={useOnto}
                onCheckedChange={checked => setUseOnto(checked === true)}
                disabled={busy}
              />
              {t('rebase.ontoToggle')}
            </label>
            {useOnto ? (
              <>
                <Input
                  id='rebase-onto'
                  value={onto}
                  onChange={e => setOnto(e.target.value)}
                  placeholder={t('rebase.ontoPlaceholder')}
                  spellCheck={false}
                  disabled={busy}
                  className='font-mono text-xs'
                />
                <p className='text-[11px] text-muted-foreground'>
                  {t('rebase.ontoHint')}
                </p>
              </>
            ) : null}
          </div>

          {error ? (
            <p
              className={cn(
                'flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive'
              )}
            >
              <AlertTriangle className='mt-0.5 h-3.5 w-3.5 shrink-0' />
              {error}
            </p>
          ) : null}

          <div className='flex justify-end gap-2 pt-1'>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={dismiss}
              disabled={busy}
            >
              {t('common.cancel')}
            </Button>
            <Button type='submit' size='sm' disabled={busy || !target}>
              {busy ? t('rebase.submitBusy') : t('rebase.submit')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
