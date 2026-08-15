import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import type { RebaseTodoAction } from '@/lib/repo-store';
import { useRepoStore } from '@/lib/repo-store';
import { cn } from '@/lib/utils';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CornerDownRight,
  GripVertical,
  ListOrdered,
  Loader2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { describeRebaseError, isLocalChangesBlock } from './rebase-errors';
import { notifyRebaseResult } from './rebase-feedback';
import {
  REBASE_ACTIONS,
  actionForKey,
  entriesFromCommits,
  isAttached,
  moveEntry,
  summarizeEntries,
  toTodoItems,
  usesMessage,
  validateEntries,
  type RebaseEntry,
} from './rebase-todo';

const ACTION_TEXT: Record<RebaseTodoAction, string> = {
  pick: 'text-muted-foreground',
  reword: 'text-git-branch',
  squash: 'text-git-modified',
  fixup: 'text-git-modified',
  edit: 'text-git-added',
  drop: 'text-destructive',
};

const ACTION_BORDER: Record<RebaseTodoAction, string> = {
  pick: 'border-border',
  reword: 'border-git-branch/50',
  squash: 'border-git-modified/50',
  fixup: 'border-git-modified/50',
  edit: 'border-git-added/50',
  drop: 'border-destructive/50',
};

function EntryRow({
  entry,
  index,
  count,
  disabled,
  registerRef,
  onAction,
  onMessage,
  onMove,
  onFocusIndex,
  overlay = false,
}: {
  entry: RebaseEntry;
  index: number;
  count: number;
  disabled: boolean;
  registerRef?: (hash: string, el: HTMLDivElement | null) => void;
  onAction: (index: number, action: RebaseTodoAction) => void;
  onMessage: (index: number, message: string) => void;
  onMove: (index: number, target: number) => void;
  onFocusIndex: (index: number) => void;
  overlay?: boolean;
}) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.hash, disabled });

  const attached = isAttached(entry.action);
  const dropped = entry.action === 'drop';

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const tag = (e.target as HTMLElement).tagName;
    if (
      tag === 'TEXTAREA' ||
      tag === 'INPUT' ||
      tag === 'SELECT' ||
      tag === 'BUTTON'
    )
      return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const delta = e.key === 'ArrowUp' ? -1 : 1;
      if (e.altKey || e.metaKey || e.ctrlKey) onMove(index, index + delta);
      else onFocusIndex(index + delta);
      return;
    }
    const next = actionForKey(e.key);
    if (!next) return;
    e.preventDefault();
    onAction(index, next);
  }

  return (
    <div
      ref={el => {
        setNodeRef(el);
        registerRef?.(entry.hash, el);
      }}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      tabIndex={overlay ? -1 : 0}
      role='listitem'
      onKeyDown={handleKeyDown}
      aria-label={`${entry.shortHash} ${entry.subject}`}
      className={cn(
        'flex flex-col gap-1.5 rounded-lg border border-border/60 bg-card px-2 py-1.5 outline-none transition-colors select-none',
        'focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/20',
        attached && 'ml-6 border-dashed bg-muted/30',
        dropped && 'opacity-60',
        isDragging && !overlay && 'opacity-30',
        overlay && 'shadow-xl ring-2 ring-primary/30'
      )}
    >
      <div className='flex items-center gap-2'>
        <Button
          type='button'
          variant='ghost'
          size='icon-xs'
          className='cursor-grab touch-none text-muted-foreground active:cursor-grabbing'
          aria-label={t('rebaseEditor.dragHandleAria')}
          disabled={disabled}
          {...listeners}
          {...attributes}
        >
          <GripVertical />
        </Button>
        {attached ? (
          <CornerDownRight className='h-3.5 w-3.5 shrink-0 text-git-modified' />
        ) : null}
        <span className='shrink-0 font-mono text-[11px] text-muted-foreground'>
          {entry.shortHash}
        </span>
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-sm',
            dropped && 'line-through decoration-destructive/60'
          )}
          title={entry.subject}
        >
          {entry.subject}
        </span>
        <NativeSelect
          size='sm'
          value={entry.action}
          onChange={e => onAction(index, e.target.value as RebaseTodoAction)}
          disabled={disabled}
          aria-label={t('rebaseEditor.actionAria')}
          className={cn('w-44 shrink-0', ACTION_TEXT[entry.action])}
        >
          {REBASE_ACTIONS.map(a => (
            <NativeSelectOption key={a} value={a}>
              {t(`rebaseEditor.action_${a}`)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <div className='flex shrink-0 items-center'>
          <Button
            type='button'
            variant='ghost'
            size='icon-xs'
            disabled={disabled || index === 0}
            onClick={() => onMove(index, index - 1)}
            aria-label={t('rebaseEditor.moveUp')}
          >
            <ArrowUp />
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='icon-xs'
            disabled={disabled || index === count - 1}
            onClick={() => onMove(index, index + 1)}
            aria-label={t('rebaseEditor.moveDown')}
          >
            <ArrowDown />
          </Button>
        </div>
      </div>
      {usesMessage(entry.action) && !overlay ? (
        <Textarea
          value={entry.message}
          onChange={e => onMessage(index, e.target.value)}
          placeholder={t('rebaseEditor.messagePlaceholder')}
          disabled={disabled}
          spellCheck={false}
          rows={2}
          className='min-h-14 font-mono text-xs'
        />
      ) : null}
    </div>
  );
}

export function RebaseInteractiveEditor({
  open,
  onClose,
  path,
  base,
  preset,
}: {
  open: boolean;
  onClose: () => void;
  path: string;
  base?: string | null;
  preset?: { hash: string; action: RebaseTodoAction } | null;
}) {
  const { t } = useTranslation();
  const rebaseTodoPreview = useRepoStore(s => s.rebaseTodoPreview);
  const rebaseInteractive = useRepoStore(s => s.rebaseInteractive);
  const commitCount = useRepoStore(s => s.repos[path]?.commits.length ?? 0);
  const currentBranch = useRepoStore(s => s.repos[path]?.branch ?? '');
  const rebaseInProgress = useRepoStore(
    s => s.rebaseState[path]?.in_progress ?? false
  );

  const fallbackBase = `HEAD~${Math.max(1, Math.min(10, commitCount - 1))}`;
  const fallbackRef = useRef(fallbackBase);
  fallbackRef.current = fallbackBase;
  const [baseRef, setBaseRef] = useState(base?.trim() || fallbackBase);
  const [entries, setEntries] = useState<RebaseEntry[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autostash, setAutostash] = useState(true);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const presetHash = preset?.hash ?? null;
  const presetAction = preset?.action ?? null;
  const presetRef = useRef(preset ?? null);
  const previewToken = useRef(0);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const pendingFocus = useRef<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (!open) return;
    presetRef.current =
      presetHash && presetAction
        ? { hash: presetHash, action: presetAction }
        : null;
    setBaseRef(base?.trim() || fallbackRef.current);
    setEntries([]);
    setOrder([]);
    setError(null);
    setLoadError(null);
    setArmed(false);
    setBusy(false);
    setAutostash(true);
  }, [open, base, presetHash, presetAction]);

  useEffect(() => {
    if (!open) return;
    const target = baseRef.trim();
    if (!target) {
      setEntries([]);
      setOrder([]);
      setLoadError(null);
      setLoading(false);
      return;
    }
    const token = ++previewToken.current;
    setLoading(true);
    setLoadError(null);
    const handle = window.setTimeout(() => {
      rebaseTodoPreview(path, target)
        .then(list => {
          if (previewToken.current !== token) return;
          setEntries(entriesFromCommits(list, presetRef.current));
          setOrder(list.map(c => c.hash));
          presetRef.current = null;
          setLoading(false);
        })
        .catch(err => {
          if (previewToken.current !== token) return;
          setEntries([]);
          setOrder([]);
          setLoadError(describeRebaseError(err));
          setLoading(false);
        });
    }, 250);
    return () => window.clearTimeout(handle);
  }, [open, path, baseRef, rebaseTodoPreview]);

  useEffect(() => {
    if (pendingFocus.current == null) return;
    const target = entries[pendingFocus.current];
    pendingFocus.current = null;
    if (target) rowRefs.current.get(target.hash)?.focus();
  }, [entries]);

  const dismiss = useCallback(() => {
    if (busy) return;
    onClose();
  }, [busy, onClose]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') dismiss();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dismiss]);

  const issue = useMemo(() => validateEntries(entries), [entries]);
  const summary = useMemo(
    () => summarizeEntries(entries, order),
    [entries, order]
  );

  function registerRef(hash: string, el: HTMLDivElement | null) {
    if (el) rowRefs.current.set(hash, el);
    else rowRefs.current.delete(hash);
  }

  function setAction(index: number, action: RebaseTodoAction) {
    setArmed(false);
    setEntries(prev =>
      prev.map((e, i) => (i === index ? { ...e, action } : e))
    );
  }

  function setMessage(index: number, message: string) {
    setEntries(prev =>
      prev.map((e, i) => (i === index ? { ...e, message } : e))
    );
  }

  function move(index: number, target: number) {
    if (target < 0 || target >= entries.length) return;
    setArmed(false);
    pendingFocus.current = target;
    setEntries(prev => moveEntry(prev, index, target));
  }

  function focusIndex(index: number) {
    const target =
      entries[Math.max(0, Math.min(entries.length - 1, index))] ?? null;
    if (target) rowRefs.current.get(target.hash)?.focus();
  }

  function handleDragStart(event: DragStartEvent) {
    setDragId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setArmed(false);
    setEntries(prev => {
      const from = prev.findIndex(e => e.hash === active.id);
      const to = prev.findIndex(e => e.hash === over.id);
      if (from < 0 || to < 0) return prev;
      return arrayMove(prev, from, to);
    });
  }

  async function start() {
    if (issue || busy) return;
    if (summary.dropped > 0 && !armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await rebaseInteractive(
        path,
        baseRef.trim(),
        toTodoItems(entries),
        autostash
      );
      notifyRebaseResult(path, res);
      onClose();
    } catch (err) {
      setError(describeRebaseError(err));
      if (isLocalChangesBlock(err)) setAutostash(true);
    } finally {
      setBusy(false);
      setArmed(false);
    }
  }

  if (!open) return null;

  const dragEntry = dragId
    ? (entries.find(e => e.hash === dragId) ?? null)
    : null;
  const issueText =
    issue === 'firstSquash'
      ? t('rebase.errors.firstSquash')
      : issue === 'allDropped'
        ? t('rebase.errors.allDropped')
        : null;

  return (
    <div
      role='dialog'
      aria-modal='true'
      aria-label={t('rebaseEditor.dialogAria')}
      className='fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4'
      onClick={dismiss}
    >
      <div
        className='flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl'
        onClick={e => e.stopPropagation()}
      >
        <header className='flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3'>
          <div className='min-w-0'>
            <h2 className='flex items-center gap-2 font-heading text-base font-medium'>
              <ListOrdered className='h-4 w-4' />
              {t('rebaseEditor.title')}
            </h2>
            <p className='truncate text-xs text-muted-foreground'>
              {t('rebaseEditor.subtitle', {
                branch: currentBranch || t('rebase.headFallback'),
              })}
            </p>
          </div>
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

        <div className='grid gap-2 border-b border-border/60 px-4 py-3'>
          <div className='grid gap-1'>
            <Label htmlFor='rebase-editor-base'>
              {t('rebaseEditor.baseLabel')}
            </Label>
            <Input
              id='rebase-editor-base'
              value={baseRef}
              onChange={e => setBaseRef(e.target.value)}
              placeholder={t('rebaseEditor.basePlaceholder')}
              spellCheck={false}
              disabled={busy}
              className='font-mono text-xs'
            />
            <p className='text-[11px] text-muted-foreground'>
              {t('rebaseEditor.baseHint')}
            </p>
          </div>
          {rebaseInProgress ? (
            <p className='flex items-start gap-2 rounded-md border border-git-modified/40 bg-git-modified/10 p-2 text-xs'>
              <AlertTriangle className='mt-0.5 h-3.5 w-3.5 shrink-0 text-git-modified' />
              {t('rebase.errors.alreadyInProgress')}
            </p>
          ) : null}
        </div>

        <div className='min-h-0 flex-1 overflow-y-auto px-4 py-3'>
          {loading ? (
            <p className='flex items-center gap-2 py-6 text-xs text-muted-foreground'>
              <Loader2 className='h-3.5 w-3.5 animate-spin' />
              {t('rebaseEditor.loading')}
            </p>
          ) : loadError ? (
            <p className='flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive'>
              <AlertTriangle className='mt-0.5 h-3.5 w-3.5 shrink-0' />
              {loadError}
            </p>
          ) : entries.length === 0 ? (
            <p className='py-6 text-center text-xs text-muted-foreground'>
              {t('rebaseEditor.empty')}
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={entries.map(e => e.hash)}
                strategy={verticalListSortingStrategy}
              >
                <div role='list' className='grid gap-1.5'>
                  {entries.map((entry, index) => (
                    <EntryRow
                      key={entry.hash}
                      entry={entry}
                      index={index}
                      count={entries.length}
                      disabled={busy}
                      registerRef={registerRef}
                      onAction={setAction}
                      onMessage={setMessage}
                      onMove={move}
                      onFocusIndex={focusIndex}
                    />
                  ))}
                </div>
              </SortableContext>
              <DragOverlay dropAnimation={{ duration: 150 }}>
                {dragEntry ? (
                  <EntryRow
                    entry={dragEntry}
                    index={0}
                    count={entries.length}
                    disabled
                    onAction={() => {}}
                    onMessage={() => {}}
                    onMove={() => {}}
                    onFocusIndex={() => {}}
                    overlay
                  />
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>

        <footer className='grid gap-2 border-t border-border/60 px-4 py-3'>
          <p className='text-[11px] text-muted-foreground'>
            {t('rebaseEditor.shortcuts')}
          </p>
          <div className='flex flex-wrap items-center gap-1.5 text-[11px]'>
            <span className='text-muted-foreground'>
              {t('rebaseEditor.summaryLabel')}
            </span>
            {REBASE_ACTIONS.filter(a => summary.counts[a] > 0).map(a => (
              <span
                key={a}
                className={cn(
                  'rounded border px-1.5 py-0.5 font-mono',
                  ACTION_TEXT[a],
                  ACTION_BORDER[a]
                )}
              >
                {summary.counts[a]}× {t(`rebaseBanner.action_${a}`)}
              </span>
            ))}
            {summary.reordered ? (
              <span className='rounded border border-git-branch/50 px-1.5 py-0.5 text-git-branch'>
                {t('rebaseEditor.summaryReordered')}
              </span>
            ) : null}
            {!summary.changed && entries.length > 0 ? (
              <span className='text-muted-foreground'>
                {t('rebaseEditor.summaryUnchanged')}
              </span>
            ) : null}
          </div>

          <label className='flex cursor-pointer items-center gap-2 text-xs'>
            <Checkbox
              checked={autostash}
              onCheckedChange={checked => setAutostash(checked === true)}
              disabled={busy}
            />
            {t('rebase.autostashLabel')}
          </label>

          {issueText ? (
            <p className='flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive'>
              <AlertTriangle className='mt-0.5 h-3.5 w-3.5 shrink-0' />
              {issueText}
            </p>
          ) : null}
          {error ? (
            <p className='flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive'>
              <AlertTriangle className='mt-0.5 h-3.5 w-3.5 shrink-0' />
              {error}
            </p>
          ) : null}
          {armed ? (
            <p className='rounded-md border border-git-modified/40 bg-git-modified/10 p-2 text-xs'>
              {t('rebaseEditor.dropConfirm', { count: summary.dropped })}
            </p>
          ) : null}

          <div className='flex justify-end gap-2'>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={dismiss}
              disabled={busy}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type='button'
              size='sm'
              variant={armed ? 'destructive' : 'default'}
              onClick={() => void start()}
              disabled={busy || !!issue || entries.length === 0}
            >
              {busy
                ? t('rebase.submitBusy')
                : armed
                  ? t('rebaseEditor.startConfirm')
                  : t('rebaseEditor.start')}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
