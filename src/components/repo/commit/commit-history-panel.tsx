import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { toastError } from '@/lib/error-toast';
import { computeReachableHashes, normalizeGitOid } from '@/lib/graph';
import type { Commit } from '@/lib/repo-store';
import { useRepoStore } from '@/lib/repo-store';
import { useUiStore } from '@/lib/ui-store';
import { writeLocalStorageDebounced } from '@/lib/utils';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { BisectStatusBanner } from '../bisect/bisect-status-banner';
import { CherryPickStatusBanner } from './cherry-pick-status-banner';
import { CommitInspectDetail } from './commit-inspect-detail';
import { CommitList } from './commit-list';
import { MergeStatusBanner } from '../merge/merge-status-banner';

const layoutStorageKey = 'l8git.history-split.layout.v1';
const EMPTY_HASH_SET: ReadonlySet<string> = new Set();
const EMPTY_BRANCH_SET: ReadonlySet<string> = new Set();

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
  const branches = useRepoStore(s => s.repos[path]?.branches ?? []);
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

  const filteredCommits = useMemo(() => {
    if (selectedBranchNames.size === 0) return commits;
    const tipHashes = branches
      .filter(b => selectedBranchNames.has(b.name))
      .map(b => b.tip);
    if (tipHashes.length === 0) return commits;
    const reachable = computeReachableHashes(commits, tipHashes);
    return commits.filter(c => reachable.has(normalizeGitOid(c.hash)));
  }, [commits, branches, selectedBranchNames]);

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

  const onToggleSelect = useCallback(
    (hash: string, mode: CommitSelectMode) => {
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
      const a = hashList.indexOf(anchor);
      const b = hashList.indexOf(hash);
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
    [anchorHash, hashList],
  );

  useEffect(() => {
    if (sidebarTab !== 'history' || activePath !== path) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (isInputFocused(e.target)) return;

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
        const curIdx = hashList.indexOf(cur);
        const nextIdx = Math.max(
          0,
          Math.min(hashList.length - 1, (curIdx < 0 ? 0 : curIdx) + dir),
        );
        const nextHash = hashList[nextIdx];
        if (!nextHash) return;

        const a = hashList.indexOf(anchor);
        const b = nextIdx;
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        const next = new Set<string>();
        for (let i = lo; i <= hi; i++) next.add(hashList[i]);
        setSelectedHashes(next);
        setCursorHash(nextHash);
        requestCommitHistoryFocus(path, nextHash);
      } else {
        const cur = cursorHash ?? selectedHash ?? anchorHash;
        const curIdx = cur ? hashList.indexOf(cur) : -1;
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
  }, [
    sidebarTab,
    activePath,
    path,
    hashList,
    selectedHash,
    selectedHashes,
    anchorHash,
    cursorHash,
    requestCommitHistoryFocus,
  ]);

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
      searchActive={isSearch}
      searchHitsExhausted={searchSlice?.exhausted ?? true}
      searchEpoch={searchSlice?.epoch ?? 0}
      selectedHash={selectedHash}
      selectedHashes={selectedHashes}
      onToggleSelect={onToggleSelect}
      onCherryPick={onCherryPick}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-white shadow-sm dark:bg-zinc-950">
      <BisectStatusBanner path={path} />
      <CherryPickStatusBanner path={path} />
      <MergeStatusBanner path={path} />
      {selectedHash ? (
        <ResizablePanelGroup
          orientation='horizontal'
          id='history-split'
          className='min-h-0 flex-1'
          defaultLayout={defaultLayout}
          onLayoutChanged={layout =>
            writeLocalStorageDebounced(layoutStorageKey, JSON.stringify(layout))
          }
        >
          <ResizablePanel
            id='commits'
            defaultSize='52%'
            minSize='24%'
            maxSize='78%'
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
            defaultSize='48%'
            minSize='22%'
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
    </div>
  );
}
