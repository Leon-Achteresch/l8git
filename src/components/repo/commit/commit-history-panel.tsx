import { useHistoryQuery, EMPTY_HISTORY_FILTER } from '@/lib/use-history-query';
import { HistoryFilters } from './history-filters';
import { Button } from '@/components/ui/button';
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
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { NewBranchDialog } from '@/components/repo/branch/new-branch-dialog';
import { toastError } from '@/lib/error-toast';
import { normalizeGitOid } from '@/lib/graph';
import type { Branch, Commit } from '@/lib/repo-store';
import { useRepoStore } from '@/lib/repo-store';
import { useHistoryHotkeys } from '@/lib/use-history-hotkeys';
import { useUiStore } from '@/lib/ui-store';
import { writeLocalStorageDebounced } from '@/lib/utils';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { StackGraphLegend } from '../branch/stack-graph-legend';
import { BisectStatusBanner } from '../bisect/bisect-status-banner';
import { CherryPickStatusBanner } from './cherry-pick-status-banner';
import { CommitInspectDetail } from './commit-inspect-detail';
import { CommitList } from './commit-list';
import { MergeStatusBanner } from '../merge/merge-status-banner';
import { RebaseInteractiveEditor } from '../rebase/rebase-interactive-editor';
import { RebaseStatusBanner } from '../rebase/rebase-status-banner';

const layoutStorageKey = 'l8git.history-split.layout.v1';
const EMPTY_HASH_SET: ReadonlySet<string> = new Set();
const EMPTY_BRANCH_SET: ReadonlySet<string> = new Set();
const EMPTY_BRANCHES: Branch[] = [];

export type CommitSelectMode = 'single' | 'toggle' | 'range';

function isInputFocused(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el?.closest(
    'input, textarea, select, [contenteditable], [role="combobox"]',
  );
}

export function CommitHistoryPanel({
  path,
  commits,
}: {
  path: string;
  commits: Commit[];
}) {
  const { t } = useTranslation();
  const branches = useRepoStore(s => s.repos[path]?.branches ?? EMPTY_BRANCHES);
  const selectedBranchNames =
    useUiStore(s => s.branchFilterByPath[path]) ?? EMPTY_BRANCH_SET;
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [selectedHashes, setSelectedHashes] =
    useState<ReadonlySet<string>>(EMPTY_HASH_SET);
  const [anchorHash, setAnchorHash] = useState<string | null>(null);
  const [cursorHash, setCursorHash] = useState<string | null>(null);

  const sidebarTab = useUiStore(s => s.sidebarTab);
  const activePath = useRepoStore(s => s.activePath);

  const bisect = useRepoStore(s => s.bisect[path]);
  const bisectStart = useRepoStore(s => s.bisectStart);
  const reloadBisect = useRepoStore(s => s.reloadBisect);
  const bisectPending = useUiStore(s => s.bisectPending[path]);
  const clearBisectPending = useUiStore(s => s.clearBisectPending);

  // Load bisect state when the panel mounts or path changes
  useEffect(() => {
    void reloadBisect(path);
  }, [path, reloadBisect]);

  // Auto-start bisect when both pending bad + good are set
  useEffect(() => {
    if (!bisectPending?.bad || !bisectPending?.good) return;
    if (bisect?.active) return;
    const { bad, good } = bisectPending;
    clearBisectPending(path);
    void bisectStart(path, bad, good);
  }, [bisectPending?.bad, bisectPending?.good, bisect?.active, path, bisectStart, clearBisectPending]);
  const requestCommitHistoryFocus = useUiStore(
    s => s.requestCommitHistoryFocus,
  );

  const searchSlice = useRepoStore(s => s.commitSearchByPath[path]);
  const [defaultLayout] = useState<Record<string, number> | undefined>(() => {
    const raw = localStorage.getItem(layoutStorageKey);
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as Record<string, number>;
    } catch {
      return undefined;
    }
  });

  useEffect(() => {
    setSelectedHash(null);
    setSelectedHashes(prev => (prev.size === 0 ? prev : EMPTY_HASH_SET));
    setAnchorHash(null);
    setCursorHash(null);
  }, [path]);

  const [historyFilter, setHistoryFilter] = useState(EMPTY_HISTORY_FILTER);
  const branchRefs = [...selectedBranchNames].map(name => branches.find(b => b.name === name)?.tip ?? name).sort();
  const queryFilter = { ...historyFilter, refs: branchRefs };
  const filtered = branchRefs.length > 0 || Object.entries(historyFilter).some(([k, v]) => k !== 'refs' && v !== '');
  const history = useHistoryQuery(path, queryFilter, filtered, commits[0]?.hash ?? '');
  const filteredCommits = filtered ? history.commits : commits;

  const isSearch = !!searchSlice?.query?.trim();
  const matchPathsByHash = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const h of searchSlice?.hits ?? []) {
      m.set(normalizeGitOid(h.commit.hash), h.matched_paths);
    }
    return m;
  }, [searchSlice?.hits]);

  const hashList = useMemo(
    () => filteredCommits.map(c => c.hash),
    [filteredCommits],
  );
  const hashIndex = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 0; i < hashList.length; i++) m.set(hashList[i], i);
    return m;
  }, [hashList]);

  const navStateRef = useRef({
    hashList,
    hashIndex,
    selectedHash,
    selectedHashes,
    anchorHash,
    cursorHash,
  });
  navStateRef.current = {
    hashList,
    hashIndex,
    selectedHash,
    selectedHashes,
    anchorHash,
    cursorHash,
  };

  const onToggleSelect = useCallback(
    (hash: string, mode: CommitSelectMode) => {
      const { hashList, hashIndex, anchorHash } = navStateRef.current;
      if (mode === 'single') {
        setSelectedHash(h => (h === hash ? null : hash));
        setSelectedHashes(new Set([hash]));
        setAnchorHash(hash);
        setCursorHash(hash);
        return;
      }

      if (mode === 'toggle') {
        setSelectedHashes(prev => {
          const next = new Set(prev);
          if (next.has(hash)) next.delete(hash);
          else next.add(hash);
          return next;
        });
        setAnchorHash(hash);
        setCursorHash(hash);
        return;
      }

      const anchor = anchorHash ?? hash;
      const a = hashIndex.get(anchor) ?? -1;
      const b = hashIndex.get(hash) ?? -1;
      if (a < 0 || b < 0) {
        setSelectedHashes(new Set([hash]));
        setCursorHash(hash);
        return;
      }
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      const next = new Set<string>();
      for (let i = lo; i <= hi; i++) next.add(hashList[i]);
      setSelectedHashes(next);
      setCursorHash(hash);
    },
    [],
  );

  useEffect(() => {
    if (sidebarTab !== 'history' || activePath !== path) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (isInputFocused(e.target)) return;
      const {
        hashList,
        hashIndex,
        selectedHash,
        selectedHashes,
        anchorHash,
        cursorHash,
      } = navStateRef.current;

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'a') {
        e.preventDefault();
        if (hashList.length === 0) return;
        setSelectedHashes(new Set(hashList));
        setAnchorHash(hashList[0]);
        setCursorHash(hashList[hashList.length - 1]);
        return;
      }

      if (e.key === 'Escape' && selectedHashes.size > 1) {
        e.preventDefault();
        const keep = selectedHash ?? [...selectedHashes][0] ?? null;
        setSelectedHash(keep);
        setSelectedHashes(keep ? new Set([keep]) : EMPTY_HASH_SET);
        setAnchorHash(keep);
        setCursorHash(keep);
        return;
      }

      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      if (hashList.length === 0) return;

      const dir = e.key === 'ArrowDown' ? 1 : -1;

      if (e.shiftKey) {
        const anchor = anchorHash ?? selectedHash ?? hashList[0];
        const cur = cursorHash ?? anchor;
        const curIdx = hashIndex.get(cur) ?? -1;
        const nextIdx = Math.max(
          0,
          Math.min(hashList.length - 1, (curIdx < 0 ? 0 : curIdx) + dir),
        );
        const nextHash = hashList[nextIdx];
        if (!nextHash) return;

        const a = hashIndex.get(anchor) ?? -1;
        const b = nextIdx;
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        const next = new Set<string>();
        for (let i = lo; i <= hi; i++) next.add(hashList[i]);
        setSelectedHashes(next);
        setCursorHash(nextHash);
        requestCommitHistoryFocus(path, nextHash);
      } else {
        const cur = cursorHash ?? selectedHash ?? anchorHash;
        const curIdx = cur ? (hashIndex.get(cur) ?? -1) : -1;
        const nextIdx = Math.max(
          0,
          Math.min(hashList.length - 1, (curIdx < 0 ? 0 : curIdx) + dir),
        );
        const nextHash = hashList[nextIdx];
        if (!nextHash) return;

        setSelectedHash(nextHash);
        setSelectedHashes(new Set([nextHash]));
        setAnchorHash(nextHash);
        setCursorHash(nextHash);
        requestCommitHistoryFocus(path, nextHash);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sidebarTab, activePath, path, requestCommitHistoryFocus]);

  const [rebaseBase, setRebaseBase] = useState<string | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const [stackInspect, setStackInspect] = useState(false);

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setStackInspect(w < 720);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const selectedCommit = useMemo(
    () => (selectedHash ? (commits.find(c => c.hash === selectedHash) ?? null) : null),
    [commits, selectedHash]
  );

  const [checkoutChoice, setCheckoutChoice] = useState<Commit | null>(null);
  const [branchFromCommit, setBranchFromCommit] = useState<Commit | null>(null);

  useHistoryHotkeys({
    path,
    commit: selectedCommit,
    enabled: sidebarTab === 'history' && activePath === path,
    onRebaseInteractive: setRebaseBase,
    onCheckoutChoice: setCheckoutChoice,
  });

  const checkoutDetached = useCallback(
    (commit: Commit) => {
      setCheckoutChoice(null);
      void useRepoStore
        .getState()
        .checkoutBranch(path, commit.hash)
        .then(() =>
          toast.success(
            t('hotkeys.historyCheckoutToast', { hash: commit.short_hash }),
          ),
        )
        .catch(e => toastError(String(e)));
    },
    [path, t],
  );

  const onCherryPick = useCallback(
    async (hashes: string[], opts?: { mainline?: number }) => {
      if (hashes.length === 0) return;
      const order = new Map(
        filteredCommits.map((c, i) => [c.hash, i] as const),
      );
      const ordered = [...hashes].sort(
        (a, b) => (order.get(b) ?? 0) - (order.get(a) ?? 0),
      );
      try {
        const out = await useRepoStore
          .getState()
          .cherryPick(path, ordered, opts);
        toast.success(
          out.trim() ||
            (ordered.length === 1
              ? 'Commit cherry-gepickt.'
              : `${ordered.length} Commits cherry-gepickt.`),
        );
        setSelectedHashes(EMPTY_HASH_SET);
      } catch (err) {
        const state = useRepoStore.getState().cherryPickState[path];
        if (!state?.in_progress) {
          toastError(String(err));
        }
      }
    },
    [filteredCommits, path],
  );

  const list = (
    <CommitList
      path={path}
      commits={filteredCommits}
      matchPathsByHash={matchPathsByHash}
      onLoadMore={filtered ? history.loadMore : undefined}
      searchActive={isSearch && !filtered}
      searchHitsExhausted={searchSlice?.exhausted ?? true}
      searchEpoch={searchSlice?.epoch ?? 0}
      selectedHash={selectedHash}
      selectedHashes={selectedHashes}
      onToggleSelect={onToggleSelect}
      onCherryPick={onCherryPick}
    />
  );

  return (
    <div ref={shellRef} className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-white shadow-sm dark:bg-zinc-950">
      <HistoryFilters value={{ ...historyFilter, refs: [...selectedBranchNames] }} onChange={value => { setHistoryFilter(value); useUiStore.getState().setBranchFilter(path, new Set(value.refs)); }} />
      {filtered && <div className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground" role="status">
        {history.loading ? t('common.loading') : history.error || (history.commits.length === 0 ? t('audit.noResults') : t('audit.filteredHistory', { count: history.commits.length }))}
        {history.error && <Button size="sm" variant="outline" onClick={history.retry}>{t('common.retry')}</Button>}
        {!history.loading && !history.exhausted && !history.error && <Button size="sm" variant="ghost" onClick={history.loadMore}>{t('audit.loadMore')}</Button>}
      </div>}
      <BisectStatusBanner path={path} />
      <CherryPickStatusBanner path={path} />
      <MergeStatusBanner path={path} />
      <RebaseStatusBanner path={path} />
      <StackGraphLegend path={path} />
      {selectedHash ? (
        <ResizablePanelGroup
          key={stackInspect ? 'history-split-v' : 'history-split-h'}
          orientation={stackInspect ? 'vertical' : 'horizontal'}
          id={stackInspect ? 'history-split-v' : 'history-split'}
          className='min-h-0 flex-1'
          defaultLayout={stackInspect ? undefined : defaultLayout}
          onLayoutChanged={layout => {
            if (stackInspect) return;
            writeLocalStorageDebounced(layoutStorageKey, JSON.stringify(layout));
          }}
        >
          <ResizablePanel
            id='commits'
            defaultSize={stackInspect ? '58%' : '52%'}
            minSize={stackInspect ? '28%' : '24%'}
            maxSize={stackInspect ? '78%' : '78%'}
            className='min-h-0 flex flex-col'
          >
            {list}
          </ResizablePanel>
          <ResizableHandle
            withHandle
            className='bg-border/50 transition-colors hover:bg-primary/20'
          />
          <ResizablePanel
            id='inspect'
            defaultSize={stackInspect ? '42%' : '48%'}
            minSize={stackInspect ? '22%' : '22%'}
            className='flex min-h-0 flex-col'
          >
            <CommitInspectDetail
              path={path}
              commitHash={selectedHash}
              onClose={() => setSelectedHash(null)}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className='flex min-h-0 flex-1 flex-col'>{list}</div>
      )}
      {rebaseBase ? (
        <RebaseInteractiveEditor
          open
          onClose={() => setRebaseBase(null)}
          path={path}
          base={rebaseBase}
        />
      ) : null}
      <AlertDialog
        open={!!checkoutChoice}
        onOpenChange={open => {
          if (!open) setCheckoutChoice(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('commitHistory.checkoutChoiceTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('commitHistory.checkoutChoiceDesc', {
                hash: checkoutChoice?.short_hash ?? '',
                subject: checkoutChoice?.subject ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              size='sm'
              variant='outline'
              onClick={() => {
                const commit = checkoutChoice;
                setCheckoutChoice(null);
                if (commit) setBranchFromCommit(commit);
              }}
            >
              {t('commitHistory.checkoutChoiceBranch')}
            </AlertDialogAction>
            <AlertDialogAction
              size='sm'
              onClick={() => {
                if (checkoutChoice) checkoutDetached(checkoutChoice);
              }}
            >
              {t('commitHistory.checkoutChoiceDetached')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <NewBranchDialog
        open={!!branchFromCommit}
        onClose={() => setBranchFromCommit(null)}
        path={path}
        branches={branches}
        commitRef={branchFromCommit?.short_hash}
        commitLabel={branchFromCommit?.subject}
      />
    </div>
  );
}
