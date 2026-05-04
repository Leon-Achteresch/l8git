import {
  buildGraph,
  normalizeGitOid,
  type GraphRow,
} from "@/lib/graph";
import type { Commit } from "@/lib/repo-store";
import { useRepoStore } from "@/lib/repo-store";
import { useUiStore } from "@/lib/ui-store";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { CommitSelectMode } from "./commit-history-panel";
import { CommitRow } from "./commit-row";

const ROW_ESTIMATE_BASE_PX = 80;
const ROW_ESTIMATE_SEARCH_EXTRA_PX = 22;

function arrowNavBlocked(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return !!el.closest(
    'input, textarea, select, [contenteditable="true"], [role="combobox"]',
  );
}

function resolveNextSearchMatchRowIndex(
  direction: "prev" | "next",
  rows: GraphRow[],
  matchIndices: number[],
  navHash: string | null,
  selectedHash: string | null,
): number | undefined {
  if (matchIndices.length === 0) return undefined;
  let curRow = -1;
  if (navHash) {
    curRow = rows.findIndex(
      (r) => normalizeGitOid(r.commit.hash) === normalizeGitOid(navHash),
    );
  }
  if (curRow < 0 && selectedHash) {
    curRow = rows.findIndex(
      (r) =>
        normalizeGitOid(r.commit.hash) === normalizeGitOid(selectedHash),
    );
  }
  const down = direction === "next";
  if (curRow < 0) {
    return down
      ? matchIndices[0]
      : matchIndices[matchIndices.length - 1];
  }
  if (down) {
    return matchIndices.find((idx) => idx > curRow) ?? matchIndices[0];
  }
  const rev = [...matchIndices].reverse();
  return (
    rev.find((idx) => idx < curRow) ??
    matchIndices[matchIndices.length - 1]
  );
}

export function CommitList({
  path,
  commits,
  matchPathsByHash,
  searchActive,
  searchHitsExhausted,
  searchEpoch,
  selectedHash,
  selectedHashes,
  onToggleSelect,
  onCherryPick,
}: {
  path: string;
  commits: Commit[];
  matchPathsByHash: ReadonlyMap<string, string[]>;
  searchActive: boolean;
  searchHitsExhausted: boolean;
  searchEpoch: number;
  selectedHash: string | null;
  selectedHashes: ReadonlySet<string>;
  onToggleSelect: (hash: string, mode: CommitSelectMode) => void;
  onCherryPick: (
    hashes: string[],
    opts?: { mainline?: number },
  ) => Promise<void>;
}) {
  const graphKey = useMemo(() => commits.map((c) => c.hash).join("|"), [commits]);
  const { rows, maxLanes } = useMemo(
    () => buildGraph(commits),
    [graphKey],
  );

  const scrollerRef = useRef<HTMLDivElement>(null);
  const commitFocusRequest = useUiStore((s) => s.commitFocusRequest);
  const clearCommitFocusRequest = useUiStore((s) => s.clearCommitFocusRequest);
  const requestCommitHistoryFocus = useUiStore((s) => s.requestCommitHistoryFocus);
  const commitSearchMatchStepRequest = useUiStore(
    (s) => s.commitSearchMatchStepRequest,
  );
  const clearCommitSearchMatchStepRequest = useUiStore(
    (s) => s.clearCommitSearchMatchStepRequest,
  );
  const sidebarTab = useUiStore((s) => s.sidebarTab);
  const activePath = useRepoStore((s) => s.activePath);
  const lastSearchNavHashRef = useRef<string | null>(null);

  useEffect(() => {
    lastSearchNavHashRef.current = null;
  }, [path, searchEpoch]);

  useEffect(() => {
    lastSearchNavHashRef.current = null;
  }, [selectedHash]);

  const matchIndices = useMemo(() => {
    const idxs: number[] = [];
    rows.forEach((r, i) => {
      if (matchPathsByHash.has(normalizeGitOid(r.commit.hash))) idxs.push(i);
    });
    return idxs;
  }, [rows, matchPathsByHash]);

  const onCherryPickCb = useCallback(
    (hashes: string[], opts?: { mainline?: number }) => {
      void onCherryPick(hashes, opts);
    },
    [onCherryPick],
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: (index) => {
      const row = rows[index];
      if (!row) return ROW_ESTIMATE_BASE_PX;
      const oid = normalizeGitOid(row.commit.hash);
      return matchPathsByHash.has(oid)
        ? ROW_ESTIMATE_BASE_PX + ROW_ESTIMATE_SEARCH_EXTRA_PX
        : ROW_ESTIMATE_BASE_PX;
    },
    overscan: 8,
    useAnimationFrameWithResizeObserver: true,
    getItemKey: (index) => rows[index]?.commit.hash ?? index,
  });

  const loadMoreCommits = useRepoStore((s) => s.loadMoreCommits);
  const loadMoreSearchCommits = useRepoStore((s) => s.loadMoreSearchCommits);
  const lastLoadedAt = useRef(0);
  const virtualItems = virtualizer.getVirtualItems();
  const lastVirtualIndex = virtualItems.length
    ? virtualItems[virtualItems.length - 1].index
    : 0;
  useEffect(() => {
    if (rows.length === 0) return;
    if (lastVirtualIndex < rows.length - 20) return;
    const now = performance.now();
    if (now - lastLoadedAt.current < 250) return;
    lastLoadedAt.current = now;
    void loadMoreCommits(path, 80);
    if (searchActive && !searchHitsExhausted) {
      void loadMoreSearchCommits(path, 80);
    }
  }, [
    lastVirtualIndex,
    rows.length,
    path,
    loadMoreCommits,
    loadMoreSearchCommits,
    searchActive,
    searchHitsExhausted,
  ]);

  useEffect(() => {
    const req = commitFocusRequest;
    if (!req || req.path !== path) return;
    const want = normalizeGitOid(req.hash);
    const index = rows.findIndex(
      (r) => normalizeGitOid(r.commit.hash) === want,
    );
    if (index < 0) {
      clearCommitFocusRequest();
      return;
    }
    virtualizer.scrollToIndex(index, { align: "center", behavior: "smooth" });
    let timeoutId = 0;
    const raf = window.requestAnimationFrame(() => {
      const el = scrollerRef.current?.querySelector<HTMLElement>(
        `[data-commit-hash="${CSS.escape(rows[index].commit.hash)}"]`,
      );
      if (el) {
        el.focus({ preventScroll: true });
      }
      timeoutId = window.setTimeout(() => clearCommitFocusRequest(), 450);
    });
    return () => {
      window.cancelAnimationFrame(raf);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [path, rows, commitFocusRequest, clearCommitFocusRequest, virtualizer]);

  useEffect(() => {
    const req = commitSearchMatchStepRequest;
    if (!req || req.path !== path) return;
    clearCommitSearchMatchStepRequest();
    const enabled =
      searchActive &&
      sidebarTab === "history" &&
      activePath === path &&
      matchIndices.length > 0;
    if (!enabled) return;
    const nextRowIdx = resolveNextSearchMatchRowIndex(
      req.direction,
      rows,
      matchIndices,
      lastSearchNavHashRef.current,
      selectedHash,
    );
    if (nextRowIdx === undefined) return;
    const row = rows[nextRowIdx];
    if (!row) return;
    lastSearchNavHashRef.current = row.commit.hash;
    requestCommitHistoryFocus(path, row.commit.hash);
  }, [
    commitSearchMatchStepRequest,
    path,
    searchActive,
    sidebarTab,
    activePath,
    matchIndices,
    rows,
    selectedHash,
    requestCommitHistoryFocus,
    clearCommitSearchMatchStepRequest,
  ]);

  useEffect(() => {
    const enabled =
      searchActive &&
      sidebarTab === "history" &&
      activePath === path &&
      matchIndices.length > 0;
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      if (arrowNavBlocked(e.target)) return;
      e.preventDefault();
      const direction = e.key === "ArrowDown" ? "next" : "prev";
      const nextRowIdx = resolveNextSearchMatchRowIndex(
        direction,
        rows,
        matchIndices,
        lastSearchNavHashRef.current,
        selectedHash,
      );
      if (nextRowIdx === undefined) return;
      const row = rows[nextRowIdx];
      if (!row) return;
      lastSearchNavHashRef.current = row.commit.hash;
      requestCommitHistoryFocus(path, row.commit.hash);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    searchActive,
    sidebarTab,
    activePath,
    path,
    matchIndices,
    rows,
    selectedHash,
    requestCommitHistoryFocus,
  ]);

  return (
    <div
      ref={scrollerRef}
      className="relative h-full min-h-0 overflow-y-auto overflow-x-hidden"
    >
      <ul
        style={{
          height: virtualizer.getTotalSize(),
          position: "relative",
        }}
      >
        {virtualItems.map((vi) => {
          const row = rows[vi.index];
          if (!row) return null;
          const oid = normalizeGitOid(row.commit.hash);
          const matchedPaths = matchPathsByHash.get(oid);
          const searchHit = searchActive && matchedPaths !== undefined;
          return (
            <li
              key={vi.key}
              data-index={vi.index}
              data-commit-hash={row.commit.hash}
              ref={virtualizer.measureElement}
              tabIndex={-1}
              className="outline-none focus:outline-none"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                transform: `translateY(${vi.start}px)`,
              }}
            >
              <CommitRow
                path={path}
                row={row}
                maxLanes={maxLanes}
                matchedPaths={matchedPaths}
                searchHit={searchHit}
                selected={
                  !!selectedHash &&
                  normalizeGitOid(selectedHash) ===
                    normalizeGitOid(row.commit.hash)
                }
                multiSelected={selectedHashes.has(row.commit.hash)}
                selectedHashes={selectedHashes}
                onSelectHash={onToggleSelect}
                onCherryPick={onCherryPickCb}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
