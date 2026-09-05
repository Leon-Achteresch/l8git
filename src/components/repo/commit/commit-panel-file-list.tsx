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
import { memo, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileRow } from "./commit-panel-file-row";
import { FolderRow } from "./commit-panel-folder-row";
import { changeTreeItems, type ChangeTreeItem } from "@/lib/change-tree";
import { useCommitPrefs } from "@/lib/commit-prefs";
import type { ChangeRow, CheckState } from "./commit-panel-types";
import { ChevronDown as ChevronDownData, ChevronRight as ChevronRightData } from "lucide";
import { MorphIcon } from "@/components/ui/morph-icon";

type SectionId = "conflicts" | "staged" | "unstaged";

type ListItem =
  | { type: "header"; id: SectionId; label: string; count: number; conflict?: boolean }
  | { type: "row"; row: ChangeRow; depth?: number }
  | {
      type: "folder";
      id: string;
      path: string;
      name: string;
      depth: number;
      paths: string[];
      sector: "staged" | "unstaged";
      fileCount: number;
    }
  | { type: "conflict-row"; row: ChangeRow };

const HEADER_HEIGHT_PX = 34;
const ROW_HEIGHT_PX = 36;
const CONFLICT_ROW_HEIGHT_PX = 36;
const FOLDER_ROW_HEIGHT_PX = 28;

function estimateItemSize(item: ListItem | undefined): number {
  if (!item) return ROW_HEIGHT_PX;
  if (item.type === "header") return HEADER_HEIGHT_PX;
  if (item.type === "folder") return FOLDER_ROW_HEIGHT_PX;
  if (item.type === "conflict-row") return CONFLICT_ROW_HEIGHT_PX;
  return ROW_HEIGHT_PX;
}

function treeListItems(
  rows: ChangeRow[],
  sector: "staged" | "unstaged",
  collapsedFolders: ReadonlySet<string>,
): ListItem[] {
  return changeTreeItems(rows, collapsedFolders, `${sector}:`).map(
    (item: ChangeTreeItem): ListItem =>
      item.type === "folder"
        ? {
            type: "folder",
            id: item.id,
            path: item.path,
            name: item.name,
            depth: item.depth,
            paths: item.paths,
            sector,
            fileCount: item.paths.length,
          }
        : { type: "row", row: item.row, depth: item.depth },
  );
}

function buildListItems(
  conflictRows: ChangeRow[],
  stagedRows: ChangeRow[],
  unstagedRows: ChangeRow[],
  collapsed: ReadonlySet<SectionId>,
  labels: { conflicts: string; staged: string; unstaged: string },
  treeView: boolean,
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
      if (treeView) items.push(...treeListItems(stagedRows, "staged", collapsedFolders));
      else for (const row of stagedRows) items.push({ type: "row", row });
    }
  }

  if (unstagedRows.length > 0) {
    items.push({ type: "header", id: "unstaged", label: labels.unstaged, count: unstagedRows.length });
    if (!collapsed.has("unstaged")) {
      if (treeView) items.push(...treeListItems(unstagedRows, "unstaged", collapsedFolders));
      else for (const row of unstagedRows) items.push({ type: "row", row });
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
  allState,
  activePath,
  onToggleAll,
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
}: {
  conflictRows: ChangeRow[];
  stagedRows: ChangeRow[];
  unstagedRows: ChangeRow[];
  selectedRowId: string | null;
  multiSelectedIds: ReadonlySet<string>;
  allState: CheckState;
  activePath: string;
  onToggleAll: () => void;
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
}) {
  const { t, i18n } = useTranslation();
  const openMergeEditor = useUiStore((s) => s.openMergeEditor);

  const [searchQuery, setSearchQuery] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<SectionId>>(new Set<SectionId>());
  const [collapsedFolders, setCollapsedFolders] = useState<ReadonlySet<string>>(new Set<string>());
  const treeView = useCommitPrefs((s) => s.fileTreeView);

  const toggleFolder = (id: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filterRows = (rows: ChangeRow[]) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.path.toLowerCase().includes(q));
  };

  const filteredConflictRows = useMemo(() => filterRows(conflictRows), [conflictRows, searchQuery]);
  const filteredStagedRows = useMemo(() => filterRows(stagedRows), [stagedRows, searchQuery]);
  const filteredUnstagedRows = useMemo(() => filterRows(unstagedRows), [unstagedRows, searchQuery]);

  const toggleSection = (id: SectionId) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const listItems = useMemo(
    () =>
      buildListItems(filteredConflictRows, filteredStagedRows, filteredUnstagedRows, collapsed, {
        conflicts: t("commitPanel.fileSectionConflicts"),
        staged: t("commitPanel.sectorStaged"),
        unstaged: t("commitPanel.sectorUnstaged"),
      }, treeView, collapsedFolders),
    [
      filteredConflictRows,
      filteredStagedRows,
      filteredUnstagedRows,
      collapsed,
      treeView,
      collapsedFolders,
      t,
      i18n.language,
    ],
  );

  const scrollerRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: listItems.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: (index) => estimateItemSize(listItems[index]),
    overscan: 12,
    paddingStart: 2,
    paddingEnd: 4,
    getItemKey: (index) => {
      const item = listItems[index];
      if (!item) return index;
      if (item.type === "header") return `h-${item.id}`;
      if (item.type === "folder") return item.id;
      return item.row.id;
    },
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
          onClick={onToggleAll}
          title={t("commitPanel.toggleAll", { defaultValue: "Toggle all" })}
          aria-label={t("commitPanel.toggleAll", { defaultValue: "Toggle all" })}
          aria-pressed={allState === "checked"}
        >
          {allState === "checked" ? (
            <CheckSquare className="text-primary" aria-hidden />
          ) : allState === "indeterminate" ? (
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
          placeholder={t("commitPanel.fileListFilter")}
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
            className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground"
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

      {isEmpty ? (
        <Empty className="m-2 border-0 bg-transparent">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CheckSquare className="size-5" aria-hidden />
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
        <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto">
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((vi) => {
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
                            title="Unstage all"
                            onClick={(e) => { e.stopPropagation(); onUnstageAll(); }}
                            className="hidden group-hover:inline-flex"
                          >
                            <Minus />
                          </Button>
                        )}
                        {item.id === "unstaged" && onStageAll && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            title="Stage all"
                            onClick={(e) => { e.stopPropagation(); onStageAll(); }}
                            className="hidden group-hover:inline-flex"
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
                        <ContextMenuItem variant="destructive" onSelect={onDiscardAllStaged}>
                          <Undo2 className="h-3.5 w-3.5" />
                          {t("commitPanel.discardAllStaged")}
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
                      name={item.name}
                      path={item.path}
                      depth={item.depth}
                      paths={item.paths}
                      collapsed={collapsedFolders.has(item.id)}
                      sector={item.sector}
                      fileCount={item.fileCount}
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
                <div key={vi.key} style={style}>
                  <FileRow
                    row={item.row}
                    selected={item.row.id === selectedRowId}
                    inMultiSelection={multiSelectedIds.has(item.row.id)}
                    multiSelectedCount={multiSelectedIds.size}
                    onSelect={onSelect}
                    onToggle={onToggle}
                    onDiscard={onDiscard}
                    onBlame={onBlame}
                    onIgnore={onIgnore}
                    depth={item.depth}
                  />
                </div>
              );
            })}
          </div>
        </div>
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
        <span className="ml-1.5 truncate text-[11px] opacity-40">
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
