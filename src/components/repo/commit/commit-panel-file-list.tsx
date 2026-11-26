import { useVirtualPoolSlots } from "@/lib/virtual-pool";
import { readRepoScroll, readRepoViewState, saveRepoViewState } from "@/lib/repo-view-state";
import { useRememberedRepoScroll } from "@/lib/use-remembered-repo-scroll";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import type { StatusEntry } from "@/lib/repo-store";
import { useUiStore } from "@/lib/ui-store";
import { useWorkspacePrefs } from "@/lib/workspace-prefs";
import { workspaceScale } from "@/lib/responsive-workspace";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertTriangle,
  CheckSquare,
  GitMerge,
  Minus,
  MinusSquare,
  Plus,
  RefreshCw,
  Search,
  Square,
  Undo2,
  X,
} from "lucide-react";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useBranchRestore } from "@/lib/github-ui/branch-context";
import { useRepoStore } from "@/lib/repo-store";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { FileRow, FileRowMenu } from "./commit-panel-file-row";
import { FolderRow } from "./commit-panel-folder-row";
import { filePathFilter } from "@/lib/file-path-filter";
import { buildChangeTree, flattenChangeTree, type ChangeTreeNode } from "@/lib/change-tree";
import { useCommitPrefs } from "@/lib/commit-prefs";
import { previousPathForRow, type ChangeRow } from "./commit-panel-types";
import { rowStagingAction, stagingPaths } from "@/lib/commit-actions";
import { Illustration } from "@/components/ui/illustration";
import { ChevronDown as ChevronDownData, ChevronRight as ChevronRightData } from "lucide";
import { MorphIcon } from "@/components/ui/morph-icon";

type SectionId = "conflicts" | "staged" | "unstaged";

type ListItem =
  | { type: "header"; id: SectionId; label: string; count: number; conflict?: boolean }
  | { type: "row"; row: ChangeRow; depth?: number }
  | {
      type: "folder";
      id: string;
      node: ChangeTreeNode;
      depth: number;
      sector: "staged" | "unstaged";
    }
  | { type: "conflict-row"; row: ChangeRow };

const HEADER_HEIGHT_PX = 34;
const ROW_HEIGHT_PX = 36;
const CONFLICT_ROW_HEIGHT_PX = 36;
const FOLDER_ROW_HEIGHT_PX = 28;

function menuRowAtElement(element: HTMLElement, items: readonly ListItem[]): ChangeRow | undefined {
  const index = element.parentElement?.dataset.index;
  if (index === undefined) return;
  const item = items[Number(index)];
  return item?.type === "row" && item.row.id === element.dataset.changeRowId ? item.row : undefined;
}

function estimateItemSize(item: ListItem | undefined, scale: number): number {
  if (item?.type === "header") return HEADER_HEIGHT_PX * scale;
  if (item?.type === "folder") return FOLDER_ROW_HEIGHT_PX * scale;
  if (item?.type === "conflict-row") return CONFLICT_ROW_HEIGHT_PX * scale;
  // Text and padding use rems; the checkbox keeps its 18px hit glyph at small
  // text scales. Account for it without measuring every mounted row.
  return Math.max(ROW_HEIGHT_PX * scale, 18 + 16 * scale);
}

function visibleRowFocusTarget(
  scroller: HTMLDivElement | null,
  rowId: string,
  source: HTMLElement,
  range: { startIndex: number; endIndex: number } | null,
): HTMLElement | null {
  if (!scroller || !range) return null;
  for (const row of scroller.querySelectorAll<HTMLElement>("[data-change-row-id]")) {
    if (row.dataset.changeRowId !== rowId) continue;
    const index = Number(row.parentElement?.dataset.index);
    if (!Number.isInteger(index) || index < range.startIndex || index > range.endIndex) return null;
    return source.tagName === "BUTTON"
      ? row.querySelector<HTMLButtonElement>("button:not(:disabled)")
      : source.hasAttribute("data-change-row-id") ? row : null;
  }
  return null;
}

function appendSectionRows(
  items: ListItem[],
  rows: ChangeRow[],
  sector: "staged" | "unstaged",
  tree: ChangeTreeNode | null,
  collapsedFolders: ReadonlySet<string>,
) {
  if (!tree) {
    for (const row of rows) items.push({ type: "row", row });
    return;
  }
  for (const item of flattenChangeTree(tree, collapsedFolders, `${sector}:`)) {
    if (item.type === "folder") items.push({ ...item, sector });
    else items.push({ type: "row", row: item.row, depth: item.depth });
  }
}

function buildListItems(
  conflictRows: ChangeRow[],
  stagedRows: ChangeRow[],
  unstagedRows: ChangeRow[],
  collapsed: ReadonlySet<SectionId>,
  labels: { conflicts: string; staged: string; unstaged: string },
  stagedTree: ChangeTreeNode | null,
  unstagedTree: ChangeTreeNode | null,
  collapsedFolders: ReadonlySet<string>,
): ListItem[] {
  const items: ListItem[] = [];

  if (conflictRows.length > 0) {
    items.push({ type: "header", id: "conflicts", label: labels.conflicts, count: conflictRows.length, conflict: true });
    if (!collapsed.has("conflicts")) {
      for (const row of conflictRows) items.push({ type: "conflict-row", row });
    }
  }

  if (stagedRows.length > 0) {
    items.push({ type: "header", id: "staged", label: labels.staged, count: stagedRows.length });
    if (!collapsed.has("staged")) {
      appendSectionRows(items, stagedRows, "staged", stagedTree, collapsedFolders);
    }
  }

  if (unstagedRows.length > 0) {
    items.push({ type: "header", id: "unstaged", label: labels.unstaged, count: unstagedRows.length });
    if (!collapsed.has("unstaged")) {
      appendSectionRows(items, unstagedRows, "unstaged", unstagedTree, collapsedFolders);
    }
  }

  return items;
}

function VirtualFileListInner({
  conflictRows,
  stagedRows,
  unstagedRows,
  selectedRowId,
  multiSelectedIds,
  activePath,
  onReload,
  onStageAll,
  onUnstageAll,
  onDiscardAllStaged,
  onSelect,
  onToggle,
  onDiscard,
  onBlame,
  onIgnore,
  onStagePaths,
  onUnstagePaths,
  onDiscardPaths,
  onVisibleRowsChange,
}: {
  conflictRows: ChangeRow[];
  stagedRows: ChangeRow[];
  unstagedRows: ChangeRow[];
  selectedRowId: string | null;
  multiSelectedIds: ReadonlySet<string>;
  activePath: string;
  onReload?: () => void;
  onStageAll?: () => void;
  onUnstageAll?: () => void;
  onDiscardAllStaged?: () => void;
  onSelect: (id: string, shiftKey: boolean) => void;
  onToggle: (entry: StatusEntry, rowId: string) => void;
  onDiscard: (rowId: string) => void;
  onBlame: (path: string) => void;
  onIgnore?: (patterns: string[]) => void;
  onStagePaths?: (paths: string[]) => void;
  onUnstagePaths?: (paths: string[]) => void;
  onDiscardPaths?: (paths: string[], worktreeOnly: boolean) => void;
  onVisibleRowsChange?: (ids: string[]) => void;
}) {
  const { t, i18n } = useTranslation();
  const openMergeEditor = useUiStore((s) => s.openMergeEditor);
  const uiScale = workspaceScale(useWorkspacePrefs((s) => s.uiScale));

  const [savedList] = useState(() => readRepoViewState(activePath).fileList);
  const [searchQuery, setSearchQuery] = useState(savedList?.query ?? "");
  const [collapsed, setCollapsed] = useState<ReadonlySet<SectionId>>(() => savedList?.collapsed ?? new Set<SectionId>());
  const [collapsedFolders, setCollapsedFolders] = useState<ReadonlySet<string>>(() => savedList?.collapsedFolders ?? new Set<string>());
  useLayoutEffect(() => {
    saveRepoViewState(activePath, { fileList: { query: searchQuery, collapsed, collapsedFolders } });
  }, [activePath, searchQuery, collapsed, collapsedFolders]);
  const treeView = useCommitPrefs((s) => s.fileTreeView);

  const toggleFolder = (id: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const query = searchQuery.trim();
  const isFiltered = query.length > 0;
  const [filteredConflictRows, filteredStagedRows, filteredUnstagedRows] = useMemo(() => {
    if (!query) return [conflictRows, stagedRows, unstagedRows];
    const matchesPath = filePathFilter(query);
    const matches = (row: ChangeRow) => matchesPath(row.path) || matchesPath(previousPathForRow(row));
    return [conflictRows.filter(matches), stagedRows.filter(matches), unstagedRows.filter(matches)];
  }, [query, conflictRows, stagedRows, unstagedRows]);
  const hasStaged = useMemo(() => filteredStagedRows.some(rowStagingAction), [filteredStagedRows]);
  const hasUnstaged = useMemo(() => filteredUnstagedRows.some(rowStagingAction), [filteredUnstagedRows]);
  const allStaged = hasStaged && !hasUnstaged;
  const stageLabel = t(isFiltered ? "commitActions.stageFiltered" : "commitActions.stageAll");
  const unstageLabel = t(isFiltered ? "commitActions.unstageFiltered" : "commitActions.unstageAll");
  const stageVisible = () => {
    if (isFiltered) onStagePaths?.(stagingPaths(filteredUnstagedRows));
    else onStageAll?.();
  };
  const unstageVisible = () => {
    if (isFiltered) onUnstagePaths?.(stagingPaths(filteredStagedRows));
    else onUnstageAll?.();
  };

  const toggleSection = (id: SectionId) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const showStagedTree = treeView && !collapsed.has("staged");
  const showUnstagedTree = treeView && !collapsed.has("unstaged");
  const stagedTree = useMemo(() => showStagedTree ? buildChangeTree(filteredStagedRows) : null, [showStagedTree, filteredStagedRows]);
  const unstagedTree = useMemo(() => showUnstagedTree ? buildChangeTree(filteredUnstagedRows) : null, [showUnstagedTree, filteredUnstagedRows]);

  const listItems = useMemo(
    () =>
      buildListItems(filteredConflictRows, filteredStagedRows, filteredUnstagedRows, collapsed, {
        conflicts: t("commitPanel.fileSectionConflicts"),
        staged: t("commitPanel.sectorStaged"),
        unstaged: t("commitPanel.sectorUnstaged"),
      }, stagedTree, unstagedTree, collapsedFolders),
    [
      filteredConflictRows,
      filteredStagedRows,
      filteredUnstagedRows,
      collapsed,
      stagedTree,
      unstagedTree,
      collapsedFolders,
      t,
      i18n.language,
    ],
  );

  const scrollerRef = useRef<HTMLDivElement>(null);
  // One dormant menu belongs to the list. Virtual rows stay ordinary DOM until a
  // user opens a menu, rather than mounting Radix providers for every scroll step.
  const menuTriggerRef = useRef<HTMLSpanElement>(null);
  const currentOwnerRef = useRef(activePath);
  currentOwnerRef.current = activePath;
  const focusedRowRef = useRef<{ element: HTMLElement; rowId: string; ownerPath: string } | null>(null);
  const pressedRowRef = useRef<{ rowId: string; ownerPath: string; pointerId: number; cancelled: boolean } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [menuTarget, setMenuTarget] = useState<{ row: ChangeRow; ownerPath: string; returnFocus: HTMLElement | null } | null>(null);
  const currentItemsRef = useRef(listItems);
  currentItemsRef.current = listItems;
  const menuTargetCurrent = useMemo(() => menuTarget?.ownerPath === activePath
    && listItems.some(item => item.type === "row" && item.row === menuTarget.row), [menuTarget, activePath, listItems]);
  const findMenuRow = (target: EventTarget | null) => {
    const element = target instanceof Element ? target.closest<HTMLElement>("[data-change-row-id]") : null;
    const row = element && scrollerRef.current?.contains(element) ? menuRowAtElement(element, listItems) : undefined;
    return row && element ? { row, element } : null;
  };
  const cancelLongPress = () => {
    if (longPressTimerRef.current !== null) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };
  useEffect(() => () => {
    if (longPressTimerRef.current !== null) clearTimeout(longPressTimerRef.current);
  }, []);
  const openRowMenu = (row: ChangeRow, x: number, y: number, returnFocus: HTMLElement | null = null) => {
    cancelLongPress();
    if (pressedRowRef.current) pressedRowRef.current.cancelled = true;
    // Install the exact target before Radix opens the content on the first event.
    flushSync(() => setMenuTarget({ row, ownerPath: activePath, returnFocus }));
    menuTriggerRef.current?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  };
  useEffect(() => {
    if (!onVisibleRowsChange) return;
    const ids: string[] = [];
    for (const item of listItems) {
      if (item.type === "row" || item.type === "conflict-row") ids.push(item.row.id);
    }
    onVisibleRowsChange(ids);
  }, [listItems, onVisibleRowsChange]);
  const getItemKey = useCallback((index: number) => {
    const item = listItems[index];
    if (!item) return index;
    if (item.type === "header") return `h-${item.id}`;
    if (item.type === "folder") return item.id;
    return item.row.id;
  }, [listItems]);

  const scrollContext = JSON.stringify([searchQuery, [...collapsed].sort(), [...collapsedFolders].sort(), treeView, uiScale]);
  const virtualizer = useVirtualizer({
    count: listItems.length,
    initialOffset: () => readRepoScroll(activePath, "filesScroll", scrollContext),
    getScrollElement: () => scrollerRef.current,
    estimateSize: (index) => estimateItemSize(listItems[index], uiScale),
    overscan: 4,
    paddingStart: 2,
    paddingEnd: 4,
    getItemKey,
  });
  useRememberedRepoScroll(scrollerRef, activePath, "filesScroll", scrollContext, listItems.length);
  // ID 68: restore the incoming branch's list scroll once its rows are present.
  const branchRestore = useBranchRestore((s) => s.request);
  const currentBranch = useRepoStore((s) => s.repos[activePath]?.branch ?? null);
  const scrollRestoredRef = useRef(0);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !branchRestore || branchRestore.scrollTop == null || scrollRestoredRef.current === branchRestore.id) return;
    if (branchRestore.path !== activePath || branchRestore.branch !== currentBranch || listItems.length === 0) return;
    scrollRestoredRef.current = branchRestore.id;
    el.scrollTop = branchRestore.scrollTop;
  }, [branchRestore, activePath, currentBranch, listItems.length]);
  // Single-line row geometry scales with the root font size. A fixed wrapper
  // avoids synchronous layout measurements whenever virtual rows mount.
  useLayoutEffect(() => { virtualizer.measure(); }, [uiScale, virtualizer]);
  const virtualItems = virtualizer.getVirtualItems();
  // Every rendered item counts for the DOM order, though only file rows take a slot.
  const fileSlots = useVirtualPoolSlots(
    virtualItems.map((vi) => vi.key),
    (i) => listItems[virtualItems[i].index]?.type === "row",
  );
  // Recycled DOM must never leave focus pointing at a different file. Keep the
  // exact logical row focused while it remains visible; otherwise release it.
  // This runs before the browser can deliver another keyboard activation.
  useLayoutEffect(() => {
    const focused = focusedRowRef.current;
    if (!focused) return;
    if (!focused.element.isConnected || focused.element !== document.activeElement) {
      focusedRowRef.current = null;
      return;
    }
    const currentRowId = focused.element.closest<HTMLElement>("[data-change-row-id]")?.dataset.changeRowId;
    if (focused.ownerPath !== activePath || currentRowId !== focused.rowId) {
      if (focused.ownerPath === activePath) {
        const target = visibleRowFocusTarget(scrollerRef.current, focused.rowId, focused.element, virtualizer.range);
        if (target) {
          target.focus({ preventScroll: true });
          return;
        }
      }
      focused.element.blur();
      focusedRowRef.current = null;
    }
  });

  const isEmpty =
    conflictRows.length === 0 && stagedRows.length === 0 && unstagedRows.length === 0;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-border/60 px-2.5 py-1.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={allStaged ? unstageVisible : stageVisible}
          title={allStaged ? unstageLabel : stageLabel}
          aria-label={allStaged ? unstageLabel : stageLabel}
          disabled={!hasStaged && !hasUnstaged}
          aria-pressed={hasStaged && hasUnstaged ? "mixed" : allStaged}
        >
          {allStaged ? (
            <CheckSquare className="text-primary" aria-hidden />
          ) : hasStaged ? (
            <MinusSquare className="text-primary/70" aria-hidden />
          ) : (
            <Square className="text-muted-foreground" aria-hidden />
          )}
        </Button>
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" aria-hidden />
        <Input
          type="text"
          variant="bare"
          inputSize="xs"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={`${t("commitPanel.fileListFilter")} (*.ts)`}
          aria-label={t("commitPanel.fileListFilter")}
          className="flex-1"
        />
        {searchQuery && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => setSearchQuery("")}
            aria-label={t("common.clear", { defaultValue: "Clear" })}
            title={t("common.clear", { defaultValue: "Clear" })}
          >
            <X aria-hidden />
          </Button>
        )}
        {multiSelectedIds.size > 1 && (
          <span
            role="status"
            className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[0.625rem] font-medium tabular-nums text-muted-foreground"
          >
            {t("commitPanel.selectionCount", { count: multiSelectedIds.size })}
          </span>
        )}
        {conflictRows.length > 0 && (
          <Button
            type="button"
            variant="warning"
            size="xs"
            onClick={() => openMergeEditor(activePath)}
            className="ml-auto"
            aria-label={t("commitPanel.resolveConflicts", { defaultValue: "Resolve conflicts" })}
          >
            <AlertTriangle aria-hidden />
            {conflictRows.length}
          </Button>
        )}
        {onReload && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onReload}
            aria-label={t("commitPanel.reloadChanges", { defaultValue: "Reload changes" })}
            title={t("commitPanel.reloadChanges", { defaultValue: "Reload changes" })}
          >
            <RefreshCw aria-hidden />
          </Button>
        )}
      </div>
      {!isEmpty && <p className="truncate border-b border-border/40 px-2.5 py-1 text-[0.625rem] text-muted-foreground/70" title={t("commitActions.selectionHint")}>{t("commitActions.selectionHint")}</p>}

      {isEmpty ? (
        <Empty className="m-2 border-0 bg-transparent">
          <EmptyHeader>
            <EmptyMedia>
              <Illustration name="clean-tree" />
            </EmptyMedia>
            <EmptyTitle>{t("commitPanel.cleanTitle", { defaultValue: "Working tree clean" })}</EmptyTitle>
            <EmptyDescription>{t("commitPanel.noChangesBrief")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : listItems.length === 0 ? (
        <Empty className="m-2 border-0 bg-transparent">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Search className="size-5" aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{t("commitPanel.noMatchesTitle", { defaultValue: "No matching files" })}</EmptyTitle>
            <EmptyDescription>
              {t("commitPanel.noMatchesBody", { defaultValue: "No files match this filter." })}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
        <div
          ref={scrollerRef}
          className="min-h-0 flex-1 overflow-y-auto"
          // The surrounding flex layout owns this viewport's size. Virtual row
          // changes must not invalidate intrinsic layout across the application.
          // Browser anchoring must not follow a recycled slot to a different file.
          style={{ contain: "strict", overflowAnchor: "none" }}
          onFocusCapture={(event) => {
            const target = findMenuRow(event.target);
            focusedRowRef.current = target && event.target instanceof HTMLElement
              ? { element: event.target, rowId: target.row.id, ownerPath: activePath }
              : null;
          }}
          onBlurCapture={(event) => {
            if (focusedRowRef.current?.element === event.target) focusedRowRef.current = null;
          }}
          onClickCapture={(event) => {
            const pressed = pressedRowRef.current;
            pressedRowRef.current = null;
            if (event.detail === 0 || !pressed) return;
            const target = findMenuRow(event.target);
            // A press can start before scrolling and end on the same DOM slot
            // after it represents a new file. Such a click has no valid target.
            if (pressed.cancelled || pressed.ownerPath !== activePath || target?.row.id !== pressed.rowId) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
          onContextMenu={(event) => {
            const target = findMenuRow(event.target);
            if (!target || event.defaultPrevented) return;
            event.preventDefault();
            event.stopPropagation();
            const pressed = pressedRowRef.current;
            // Some platforms open on right-button release. Recycling between
            // down and release must not silently change the menu's file target.
            if (pressed && (pressed.cancelled || pressed.ownerPath !== activePath || pressed.rowId !== target.row.id)) {
              cancelLongPress();
              pressed.cancelled = true;
              return;
            }
            openRowMenu(target.row, event.clientX, event.clientY);
          }}
          onKeyDownCapture={(event) => {
            if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
            const target = findMenuRow(event.target);
            if (!target) return;
            event.preventDefault();
            event.stopPropagation();
            const bounds = target.element.getBoundingClientRect();
            openRowMenu(target.row, bounds.left + Math.min(32, bounds.width / 2), bounds.top + bounds.height / 2, event.target instanceof HTMLElement ? event.target : target.element);
          }}
          onPointerDownCapture={(event) => {
            cancelLongPress();
            const target = findMenuRow(event.target);
            pressedRowRef.current = target ? { rowId: target.row.id, ownerPath: activePath, pointerId: event.pointerId, cancelled: false } : null;
            if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
            if (!target) return;
            const { clientX, clientY } = event;
            longPressTimerRef.current = setTimeout(() => {
              if (target.element.isConnected && currentOwnerRef.current === activePath && menuRowAtElement(target.element, currentItemsRef.current) === target.row) openRowMenu(target.row, clientX, clientY);
            }, 700);
          }}
          onPointerMoveCapture={cancelLongPress}
          onPointerUpCapture={cancelLongPress}
          onPointerCancelCapture={(event) => {
            cancelLongPress();
            if (pressedRowRef.current?.pointerId === event.pointerId) pressedRowRef.current = null;
          }}
          onScroll={cancelLongPress}
        >
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualItems.map((vi) => {
              const item = listItems[vi.index];
              if (!item) return null;

              const style: React.CSSProperties = {
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                transform: `translateY(${vi.start}px)`,
                height: vi.size,
              };

              if (item.type === "header") {
                const isCollapsed = collapsed.has(item.id);
                const headerNode = (
                  <div
                    key={vi.key}
                    style={style}
                    className="sticky top-0 z-10 bg-background/95 backdrop-blur-[2px]"
                  >
                    <div
                      className="group flex h-full cursor-pointer items-center justify-between pl-2.5 pr-2 hover:bg-muted/40"
                      onClick={() => toggleSection(item.id)}
                    >
                      <span className="flex items-center gap-1.5">
                        <MorphIcon
                          icon={isCollapsed ? ChevronRightData : ChevronDownData}
                          className="h-3.5 w-3.5 text-muted-foreground/40"
                        />
                        <span
                          className={
                            "text-xs font-medium " +
                            (item.conflict ? "text-git-modified" : "text-muted-foreground")
                          }
                        >
                          {item.label}
                        </span>
                      </span>
                      <div className="flex items-center gap-1">
                        {item.id === "staged" && onUnstageAll && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            title={unstageLabel}
                            aria-label={unstageLabel}
                            disabled={!hasStaged}
                            onClick={(e) => { e.stopPropagation(); unstageVisible(); }}
                            className="opacity-50 hover:opacity-100"
                          >
                            <Minus />
                          </Button>
                        )}
                        {item.id === "unstaged" && onStageAll && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            title={stageLabel}
                            aria-label={stageLabel}
                            disabled={!hasUnstaged}
                            onClick={(e) => { e.stopPropagation(); stageVisible(); }}
                            className="opacity-50 hover:opacity-100"
                          >
                            <Plus />
                          </Button>
                        )}
                        <Badge variant="secondary" className="font-mono tabular-nums">
                          {item.count}
                        </Badge>
                      </div>
                    </div>
                  </div>
                );

                if (item.id === "staged" && onDiscardAllStaged && stagedRows.length > 0) {
                  return (
                    <ContextMenu key={vi.key}>
                      <ContextMenuTrigger asChild>{headerNode}</ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem variant="destructive" disabled={!hasStaged} onSelect={() => { if (isFiltered) onDiscardPaths?.(stagingPaths(filteredStagedRows), false); else onDiscardAllStaged(); }}>
                          <Undo2 className="h-3.5 w-3.5" />
                          {t(isFiltered ? "commitActions.discardFilteredStaged" : "commitPanel.discardAllStaged")}
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  );
                }

                return headerNode;
              }

              if (item.type === "folder") {
                return (
                  <div key={vi.key} style={style}>
                    <FolderRow
                      folder={item.node}
                      depth={item.depth}
                      collapsed={collapsedFolders.has(item.id)}
                      sector={item.sector}
                      onToggleCollapsed={() => toggleFolder(item.id)}
                      onStage={onStagePaths}
                      onUnstage={onUnstagePaths}
                      onDiscard={onDiscardPaths}
                      onIgnore={onIgnore}
                    />
                  </div>
                );
              }

              if (item.type === "conflict-row") {
                return (
                  <div key={vi.key} style={style}>
                    <ConflictRowWithPath
                      row={item.row}
                      selected={item.row.id === selectedRowId}
                      activePath={activePath}
                      onSelect={onSelect}
                    />
                  </div>
                );
              }

              return (
                // Only stateless file rows recycle their viewport position.
                // TanStack still tracks their exact logical ids independently.
                <div key={`file-slot:${fileSlots.get(vi.key)}`} data-index={vi.index} style={style}>
                  <FileRow
                    row={item.row}
                    selected={item.row.id === selectedRowId}
                    inMultiSelection={multiSelectedIds.has(item.row.id)}
                    onSelect={onSelect}
                    onToggle={onToggle}
                    depth={item.depth}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <ContextMenu key={`${activePath}\n${menuTarget && !menuTargetCurrent ? "invalid" : "current"}`}>
        <ContextMenuTrigger asChild><span ref={menuTriggerRef} hidden aria-hidden="true" /></ContextMenuTrigger>
        {menuTarget && menuTargetCurrent && <FileRowMenu
          repoPath={activePath}
          row={menuTarget.row}
          inMultiSelection={multiSelectedIds.has(menuTarget.row.id)}
          multiSelectedCount={multiSelectedIds.size}
          onDiscard={onDiscard}
          onBlame={onBlame}
          onIgnore={onIgnore}
          onCloseAutoFocus={(event) => {
            // Radix's saved focus may belong to a replaced repository or row.
            // Only restore the explicitly captured and still-owned target.
            event.preventDefault();
            const { returnFocus, ownerPath, row } = menuTarget;
            if (returnFocus && currentOwnerRef.current === ownerPath) {
              const target = visibleRowFocusTarget(scrollerRef.current, row.id, returnFocus, virtualizer.range);
              target?.focus({ preventScroll: true });
            }
            setMenuTarget(current => current === menuTarget ? null : current);
          }}
        />}
        </ContextMenu>
        </>
      )}
    </div>
  );
}

function ConflictRowWithPath({
  row,
  selected,
  activePath,
  onSelect,
}: {
  row: ChangeRow;
  selected: boolean;
  activePath: string;
  onSelect: (id: string, shiftKey: boolean) => void;
}) {
  const { t } = useTranslation();
  const openMergeEditor = useUiStore((s) => s.openMergeEditor);

  return (
    <div
      onClick={(e) => {
        if (e.shiftKey) e.preventDefault();
        onSelect(row.id, e.shiftKey);
      }}
      className={
        "group relative flex h-full cursor-pointer select-none items-center gap-2 px-4 py-1.5 text-sm transition-colors " +
        (selected
          ? "bg-git-modified/15 text-foreground before:absolute before:left-0 before:top-0 before:h-full before:w-[2px] before:bg-git-modified"
          : "text-muted-foreground hover:bg-git-modified/10")
      }
    >
      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-git-modified" />
      <span className="min-w-0 flex-1 truncate text-sm">
        <span className="font-medium">{row.path.split("/").pop()}</span>
        <span className="ml-1.5 truncate text-[0.6875rem] opacity-40">
          {row.path.split("/").slice(0, -1).join("/")}
        </span>
      </span>
      <Button
        type="button"
        variant="warning"
        size="xs"
        onClick={(e) => {
          e.stopPropagation();
          openMergeEditor(activePath, row.path);
        }}
        className="ml-auto"
        title={t("commitPanel.openConflictEditor")}
      >
        <GitMerge />
        {t("commitPanel.resolveVerb")}
      </Button>
    </div>
  );
}

export const VirtualFileList = memo(VirtualFileListInner);
