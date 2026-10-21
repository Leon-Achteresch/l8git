import { historySectionTitleResolver } from "@/lib/commit-history-sections";
import { virtualPoolSlot } from "@/lib/virtual-pool";
import {
  buildGraph,
  compareBranchesDisplay,
  normalizeGitOid,
  type GraphRow,
} from "@/lib/graph";
import { CommitGraphShapes, graphColWidth } from "./commit-graph-cell";
import type { Branch, Commit } from "@/lib/repo-store";
import { useRepoStore } from "@/lib/repo-store";
import { useUiStore } from "@/lib/ui-store";
import { useCommitPrefs } from "@/lib/commit-prefs";
import { useStackLabels } from "@/lib/stack-store";
import { useWorkspacePrefs } from "@/lib/workspace-prefs";
import { workspaceScale } from "@/lib/responsive-workspace";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { hasStagedChanges } from "@/components/repo/rebase/rebase-quick-actions";
import type { BisectRole } from "./commit-row";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import type { CommitSelectMode } from "./commit-history-panel";
import { CommitRow, CommitRowActions } from "./commit-row";
import {
  estimateHistoryHeaderHeight,
  estimateHistoryRowHeight,
  createHistoryRowObserver,
} from "./history-row-measurement";
import { HistoryVirtualRow } from "./history-virtual-row";

const EMPTY_HASHES: ReadonlySet<string> = new Set();
const EMPTY_BRANCHES: Branch[] = [];

type FlatItem =
  | { kind: "header"; key: string; label: string }
  | { kind: "commit"; rowIndex: number };

function arrowNavBlocked(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return !!el.closest(
    'input, textarea, select, [contenteditable="true"], [role="combobox"], [role="menu"], [role="dialog"], [role="alertdialog"]',
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
      (r) => normalizeGitOid(r.commit.hash) === normalizeGitOid(selectedHash),
    );
  }
  const down = direction === "next";
  if (curRow < 0) {
    return down ? matchIndices[0] : matchIndices[matchIndices.length - 1];
  }
  if (down) {
    return matchIndices.find((idx) => idx > curRow) ?? matchIndices[0];
  }
  const rev = [...matchIndices].reverse();
  return (
    rev.find((idx) => idx < curRow) ?? matchIndices[matchIndices.length - 1]
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
  onLoadMore,
}: {
  path: string;
  onLoadMore?: () => unknown;
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
  const { i18n } = useTranslation();
  const bisect = useRepoStore((s) => s.bisect[path]);
  const bisectPending = useUiStore((s) => s.bisectPending[path]);
  const bisectVisible = useUiStore((s) => s.bisectVisible);
  const showCommitDateGroups = useCommitPrefs((s) => s.showCommitDateGroups);
  const graphLanePxMin = useCommitPrefs((s) => s.graphLanePxMin);
  const graphLanePxMax = useCommitPrefs((s) => s.graphLanePxMax);
  const showConventionalIcons = useCommitPrefs(
    (s) => s.showConventionalCommitIcons,
  );
  const stackLabels = useStackLabels(path);
  const uiScale = workspaceScale(useWorkspacePrefs((s) => s.uiScale));
  const branches = useRepoStore(
    (s) => s.repos[path]?.branches ?? EMPTY_BRANCHES,
  );

  const graphKey = useMemo(() => {
    const n = commits.length;
    return n === 0 ? "" : `${n}:${commits[0].hash}:${commits[n - 1].hash}`;
  }, [commits]);
  // Stable key for the branches list – rebuild the graph when tips change
  const branchesKey = useMemo(
    () => branches.map((b) => `${b.name}:${b.tip}`).join("|"),
    [branches],
  );
  const { rows, maxLanes, originColors } = useMemo(
    () => buildGraph(commits, branches),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graphKey, branchesKey],
  );
  const colW = graphColWidth(maxLanes, graphLanePxMin, graphLanePxMax);

  const branchesByTipOid = useMemo(() => {
    const m = new Map<string, Branch[]>();
    for (const b of branches) {
      const oid = normalizeGitOid(b.tip);
      const list = m.get(oid);
      if (list) list.push(b);
      else m.set(oid, [b]);
    }
    for (const list of m.values()) list.sort(compareBranchesDisplay);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchesKey]);

  const bisectRoleMap = useMemo((): Map<string, BisectRole> => {
    const m = new Map<string, BisectRole>();
    if (!bisectVisible) return m;
    if (bisect?.active) {
      for (const h of bisect.marked_bad) m.set(normalizeGitOid(h), "bad");
      for (const h of bisect.marked_good) m.set(normalizeGitOid(h), "good");
      if (bisect.done && bisect.result_hash) {
        m.set(normalizeGitOid(bisect.result_hash), "result");
      } else if (bisect.current_hash) {
        m.set(normalizeGitOid(bisect.current_hash), "current");
      }
    } else if (bisectPending) {
      if (bisectPending.bad)
        m.set(normalizeGitOid(bisectPending.bad), "pending-bad");
      if (bisectPending.good)
        m.set(normalizeGitOid(bisectPending.good), "pending-good");
    }
    return m;
  }, [bisect, bisectPending, bisectVisible]);

  const flatItems = useMemo((): FlatItem[] => {
    const out: FlatItem[] = [];
    let last = "";
    const sectionTitle = showCommitDateGroups
      ? historySectionTitleResolver()
      : null;
    for (let i = 0; i < rows.length; i++) {
      if (sectionTitle) {
        const sec = sectionTitle(rows[i].commit.date);
        if (sec !== last) {
          out.push({ kind: "header", key: `${sec}-${i}`, label: sec });
          last = sec;
        }
      }
      out.push({ kind: "commit", rowIndex: i });
    }
    return out;
  }, [rows, showCommitDateGroups, i18n.language]);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const focusedRowRef = useRef<{
    element: HTMLElement;
    hash: string;
    path: string;
  } | null>(null);
  // Share the menu across virtual rows. Action/dialog state outlives closing the
  // menu, while row providers and closed dialog trees stay out of the hot path.
  const contextRowRef = useRef<GraphRow | null>(null);
  const contextElementRef = useRef<HTMLElement | null>(null);
  const contextReturnHashRef = useRef<string | null>(null);
  const contextPointerIntentRef = useRef<{ path: string; hash: string } | null>(
    null,
  );
  const keyboardContextRef = useRef(false);
  const contextOwnerPathRef = useRef(path);
  const livePathRef = useRef(path);
  livePathRef.current = path;
  const [contextMenuEpoch, setContextMenuEpoch] = useState(0);
  const [contextSelection, setContextSelection] = useState<{
    path: string;
    commit: Commit;
    multiSelected: boolean;
    selectedHashes: ReadonlySet<string>;
    bisectRole: BisectRole | null;
    bisectActive: boolean;
    staged: boolean;
  } | null>(null);
  const rowsByHash = useMemo(
    () => new Map(rows.map((row) => [row.commit.hash, row])),
    [rows],
  );
  const captureContextRow = useCallback(
    (target: EventTarget | null) => {
      const element =
        target instanceof Element
          ? target.closest<HTMLElement>("[data-commit-hash]")
          : null;
      contextElementRef.current = element;
      contextRowRef.current = element
        ? (rowsByHash.get(element.dataset.commitHash ?? "") ?? null)
        : null;
      return contextRowRef.current !== null;
    },
    [rowsByHash],
  );
  const restoreContextRowFocus = useCallback((event: Event) => {
    event.preventDefault();
    const hash = contextReturnHashRef.current;
    if (!hash || contextOwnerPathRef.current !== livePathRef.current) return;
    let element = contextElementRef.current;
    // A connected pooled node can now represent another commit. Restore only
    // the captured OID, and never move focus to a row which reused its slot.
    if (!element?.isConnected || element.dataset.commitHash !== hash) {
      element =
        scrollerRef.current?.querySelector<HTMLElement>(
          `[data-commit-hash="${CSS.escape(hash)}"]`,
        ) ?? null;
    }
    element?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (
      contextSelection &&
      (contextSelection.path !== path ||
        !rowsByHash.has(contextSelection.commit.hash))
    ) {
      setContextSelection(null);
      contextRowRef.current = null;
      contextElementRef.current = null;
      contextReturnHashRef.current = null;
      // Unmount the Radix root too, so an invalidated menu cannot stay open.
      setContextMenuEpoch((epoch) => epoch + 1);
    }
  }, [path, rowsByHash, contextSelection]);
  const commitFocusRequest = useUiStore((s) => s.commitFocusRequest);
  const clearCommitFocusRequest = useUiStore((s) => s.clearCommitFocusRequest);
  const requestCommitHistoryFocus = useUiStore(
    (s) => s.requestCommitHistoryFocus,
  );
  const commitSearchMatchStepRequest = useUiStore(
    (s) => s.commitSearchMatchStepRequest,
  );
  const clearCommitSearchMatchStepRequest = useUiStore(
    (s) => s.clearCommitSearchMatchStepRequest,
  );
  const sidebarTab = useUiStore((s) => s.sidebarTab);
  const activePath = useRepoStore((s) => s.activePath);
  const lastSearchNavHashRef = useRef<string | null>(null);
  const [focusRingPulse, setFocusRingPulse] = useState<{
    hash: string;
    token: number;
  } | null>(null);

  useEffect(() => {
    lastSearchNavHashRef.current = null;
    setFocusRingPulse(null);
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

  const rowIndexFromFlatIndex = useCallback(
    (flatIndex: number) => {
      const it = flatItems[flatIndex];
      return it?.kind === "commit" ? it.rowIndex : -1;
    },
    [flatItems],
  );

  const onCherryPickCb = useCallback(
    (hashes: string[], opts?: { mainline?: number }) => {
      void onCherryPick(hashes, opts);
    },
    [onCherryPick],
  );

  const getItemKey = useCallback(
    (index: number) => {
      const it = flatItems[index];
      if (!it) return index;
      if (it.kind === "header") return it.key;
      return rows[it.rowIndex]?.commit.hash ?? index;
    },
    [flatItems, rows],
  );

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: (index) => {
      const it = flatItems[index];
      if (!it || it.kind === "header")
        return estimateHistoryHeaderHeight(uiScale);
      const row = rows[it.rowIndex];
      if (!row) return estimateHistoryRowHeight(uiScale);
      const oid = normalizeGitOid(row.commit.hash);
      return estimateHistoryRowHeight(uiScale, matchPathsByHash.has(oid));
    },
    overscan: 8,
    getItemKey,
  });
  const rowObserver = useMemo(
    () =>
      createHistoryRowObserver((index, height, key) => {
        if (virtualizer.options.getItemKey(index) === key)
          virtualizer.resizeItem(index, height);
      }),
    [virtualizer],
  );
  useLayoutEffect(() => {
    rowObserver.start();
    return () => rowObserver.disconnect();
  }, [rowObserver]);
  useLayoutEffect(() => {
    virtualizer.measure();
  }, [uiScale, virtualizer]);

  const loadMoreCommits = useRepoStore((s) => s.loadMoreCommits);
  const loadMoreSearchCommits = useRepoStore((s) => s.loadMoreSearchCommits);
  const lastLoadedAt = useRef(0);
  const virtualItems = virtualizer.getVirtualItems();
  useLayoutEffect(() => {
    const focused = focusedRowRef.current;
    if (!focused) return;
    const active = document.activeElement;
    if (
      active !== focused.element &&
      (focused.element.isConnected || active !== document.body)
    ) {
      focusedRowRef.current = null;
      return;
    }
    const currentHash = focused.element.closest<HTMLElement>(
      "[data-commit-hash]",
    )?.dataset.commitHash;
    if (
      focused.path !== path ||
      currentHash !== focused.hash ||
      !focused.element.isConnected
    ) {
      // Reconcile after React restores selection for the commit. Blurring a
      // recycled slot in its ref cleanup lets React refocus the wrong commit.
      const target =
        focused.path === path
          ? scrollerRef.current?.querySelector<HTMLElement>(
              `[data-commit-hash="${CSS.escape(focused.hash)}"]`,
            )
          : null;
      if (target) {
        target.focus({ preventScroll: true });
        return;
      }
      focused.element.blur();
      focusedRowRef.current = null;
    }
  });
  const maxVisibleRowIndex = useMemo(() => {
    let m = 0;
    for (const vi of virtualItems) {
      const ri = rowIndexFromFlatIndex(vi.index);
      if (ri >= 0) m = Math.max(m, ri);
    }
    return m;
  }, [virtualItems, rowIndexFromFlatIndex]);
  useEffect(() => {
    if (rows.length === 0) return;
    if (maxVisibleRowIndex < rows.length - 20) return;
    const now = performance.now();
    if (now - lastLoadedAt.current < 250) return;
    lastLoadedAt.current = now;
    if (onLoadMore) {
      onLoadMore();
      return;
    }
    void loadMoreCommits(path, 80);
    if (searchActive && !searchHitsExhausted) {
      void loadMoreSearchCommits(path, 80);
    }
  }, [
    onLoadMore,
    maxVisibleRowIndex,
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
      if (useUiStore.getState().commitFocusRequest === req)
        clearCommitFocusRequest();
      return;
    }
    setFocusRingPulse({ hash: want, token: req.id });
    const flatIndex = flatItems.findIndex(
      (item) => item.kind === "commit" && item.rowIndex === index,
    );
    // Date-group headers occupy virtual rows of their own.
    virtualizer.scrollToIndex(flatIndex, { align: "center", behavior: "auto" });
    const deadline = performance.now() + 450;
    let raf = 0;
    const focusRequestedCommit = () => {
      // Rapid navigation can replace the request before the virtual row mounts.
      if (useUiStore.getState().commitFocusRequest !== req) return;
      const el = scrollerRef.current?.querySelector<HTMLElement>(
        `[data-commit-hash="${CSS.escape(rows[index].commit.hash)}"]`,
      );
      if (el) {
        el.focus({ preventScroll: true });
      } else if (performance.now() < deadline) {
        raf = window.requestAnimationFrame(focusRequestedCommit);
      }
    };
    raf = window.requestAnimationFrame(focusRequestedCommit);
    const timeoutId = window.setTimeout(() => {
      if (useUiStore.getState().commitFocusRequest === req)
        clearCommitFocusRequest();
    }, 450);
    const pulseClearId = window.setTimeout(() => {
      setFocusRingPulse((p) => (p?.token === req.id ? null : p));
    }, 1000);
    return () => {
      window.cancelAnimationFrame(raf);
      if (timeoutId) window.clearTimeout(timeoutId);
      if (pulseClearId) window.clearTimeout(pulseClearId);
    };
  }, [
    path,
    rows,
    flatItems,
    commitFocusRequest,
    clearCommitFocusRequest,
    virtualizer,
  ]);

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
      if (e.defaultPrevented) return;
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
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

  // The parent allocates this viewport's size. Keep virtual content from
  // invalidating the document's intrinsic layout on every scroll frame.
  return (
    <div
      ref={scrollerRef}
      className="relative isolate h-full min-h-0 overflow-y-auto overflow-x-hidden bg-white dark:bg-zinc-950"
      style={{ contain: "strict", overflowAnchor: "none" }}
      onFocusCapture={(event) => {
        const element = event.target;
        const row =
          element instanceof HTMLElement
            ? element.closest<HTMLElement>("[data-commit-hash]")
            : null;
        focusedRowRef.current =
          element instanceof HTMLElement && row?.dataset.commitHash
            ? { element, hash: row.dataset.commitHash, path }
            : null;
      }}
      onBlurCapture={(event) => {
        if (focusedRowRef.current?.element === event.target)
          focusedRowRef.current = null;
      }}
    >
      <ContextMenu
        key={`${path}:${contextMenuEpoch}`}
        onOpenChange={(open) => {
          if (!open) return;
          const contextRow = contextRowRef.current;
          const element = contextElementRef.current;
          if (
            !contextRow ||
            !element?.isConnected ||
            element.dataset.commitHash !== contextRow.commit.hash
          ) {
            setContextSelection(null);
            setContextMenuEpoch((epoch) => epoch + 1);
            return;
          }
          const commit = contextRow.commit;
          contextReturnHashRef.current = commit.hash;
          contextOwnerPathRef.current = path;
          const multiSelected = selectedHashes.has(commit.hash);
          setContextSelection({
            path,
            commit,
            multiSelected,
            selectedHashes: multiSelected ? selectedHashes : EMPTY_HASHES,
            bisectRole: bisectRoleMap.get(normalizeGitOid(commit.hash)) ?? null,
            bisectActive: bisect?.active ?? false,
            staged: hasStagedChanges(path),
          });
        }}
      >
        <ContextMenuTrigger asChild>
          <ul
            onKeyDown={(event) => {
              if (
                event.key !== "ContextMenu" &&
                !(event.shiftKey && event.key === "F10")
              )
                return;
              if (
                arrowNavBlocked(event.target) ||
                !captureContextRow(event.target)
              )
                return;
              event.preventDefault();
              const target = (event.target as Element).closest<HTMLElement>(
                "[data-commit-hash]",
              );
              if (!target) return;
              const rect = target.getBoundingClientRect();
              keyboardContextRef.current = true;
              contextPointerIntentRef.current = null;
              try {
                target.dispatchEvent(
                  new MouseEvent("contextmenu", {
                    bubbles: true,
                    cancelable: true,
                    button: 2,
                    clientX: Math.min(rect.left + 16, window.innerWidth - 16),
                    clientY: Math.min(
                      rect.top + rect.height / 2,
                      window.innerHeight - 16,
                    ),
                  }),
                );
              } finally {
                keyboardContextRef.current = false;
              }
            }}
            onContextMenuCapture={(event) => {
              const intent = contextPointerIntentRef.current;
              contextPointerIntentRef.current = null;
              const element =
                event.target instanceof Element
                  ? event.target.closest<HTMLElement>("[data-commit-hash]")
                  : null;
              if (
                !keyboardContextRef.current &&
                intent &&
                (intent.path !== path ||
                  intent.hash !== element?.dataset.commitHash)
              ) {
                // Windows can dispatch contextmenu on right-button release.
                // A pool slot reused since right-down is a different target.
                event.preventDefault();
                return;
              }
              if (!captureContextRow(event.target)) event.preventDefault();
            }}
            onPointerDownCapture={(event) => {
              contextPointerIntentRef.current = null;
              if (event.button === 2 || event.pointerType !== "mouse") {
                if (!captureContextRow(event.target)) {
                  event.preventDefault();
                  return;
                }
                contextPointerIntentRef.current = {
                  path,
                  hash: contextRowRef.current!.commit.hash,
                };
              }
            }}
            onPointerCancelCapture={() => {
              contextPointerIntentRef.current = null;
            }}
            style={{
              height: virtualizer.getTotalSize(),
              position: "relative",
              contain: "layout style",
            }}
          >
            {virtualItems.map((vi) => {
              const slot = virtualPoolSlot(vi.index, virtualItems.length);
              const item = flatItems[vi.index];
              if (!item) return null;
              if (item.kind === "header") {
                return (
                  <HistoryVirtualRow
                    key={`${path}:${slot}`}
                    item={vi}
                    observer={rowObserver}
                  >
                    <div className="bg-card px-3 pb-0.5 pt-2 text-[0.625rem] font-medium uppercase tracking-wide text-muted-foreground">
                      {item.label}
                    </div>
                  </HistoryVirtualRow>
                );
              }
              const row = rows[item.rowIndex];
              if (!row) return null;
              const oid = normalizeGitOid(row.commit.hash);
              const matchedPaths = matchPathsByHash.get(oid);
              const searchHit = searchActive && matchedPaths !== undefined;
              const focusPulseToken =
                focusRingPulse && focusRingPulse.hash === oid
                  ? focusRingPulse.token
                  : undefined;
              const multiSel = selectedHashes.has(row.commit.hash);
              const isSelected =
                !!selectedHash && normalizeGitOid(selectedHash) === oid;
              return (
                <HistoryVirtualRow
                  key={`${path}:${slot}`}
                  item={vi}
                  hash={row.commit.hash}
                  observer={rowObserver}
                >
                  <CommitRow
                    row={row}
                    colW={colW}
                    branchesAtCommit={
                      branchesByTipOid.get(oid) ?? EMPTY_BRANCHES
                    }
                    stackLabels={stackLabels}
                    showConventionalIcons={showConventionalIcons}
                    matchedPaths={matchedPaths}
                    searchHit={searchHit}
                    focusPulseToken={focusPulseToken}
                    selected={isSelected}
                    multiSelected={multiSel}
                    onSelectHash={onToggleSelect}
                    bisectRole={
                      bisectRoleMap.get(normalizeGitOid(row.commit.hash)) ??
                      null
                    }
                  />
                </HistoryVirtualRow>
              );
            })}
          </ul>
        </ContextMenuTrigger>
        {contextSelection?.path === path &&
          rowsByHash.has(contextSelection.commit.hash) && (
            <CommitRowActions
              key={`${path}:${contextSelection.commit.hash}`}
              {...contextSelection}
              isMergeCommit={contextSelection.commit.parents.length > 1}
              onCherryPick={onCherryPickCb}
              onCloseAutoFocus={restoreContextRowFocus}
            />
          )}
      </ContextMenu>
      {/* One SVG draws the graph for every row in the window, over the rows'
          graph column (their mx-1.5 inset and my-px gaps); it scrolls with them. */}
      <svg
        aria-hidden="true"
        data-commit-graph=""
        className="pointer-events-none absolute left-1.5 top-0 text-foreground"
        width={colW}
        height={virtualizer.getTotalSize()}
      >
        {virtualItems.map((vi) => {
          const item = flatItems[vi.index];
          const row = item?.kind === "commit" ? rows[item.rowIndex] : undefined;
          if (!row) return null;
          return (
            <CommitGraphShapes
              key={`${path}:${virtualPoolSlot(vi.index, virtualItems.length)}`}
              row={row}
              maxLanes={maxLanes}
              isBranchTip={branchesByTipOid.has(normalizeGitOid(row.commit.hash))}
              originColors={originColors}
              colWidth={colW}
              top={vi.start + 1}
              rowHeight={vi.size - 2}
            />
          );
        })}
      </svg>
    </div>
  );
}
