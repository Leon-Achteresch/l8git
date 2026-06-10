import type { StatusEntry } from "@/lib/repo-store";
import { useUiStore } from "@/lib/ui-store";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertTriangle,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  GitMerge,
  Minus,
  MinusSquare,
  Plus,
  RefreshCw,
  Search,
  Square,
  X,
} from "lucide-react";
import { memo, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileRow } from "./commit-panel-file-row";
import type { ChangeRow, CheckState } from "./commit-panel-types";

type SectionId = "conflicts" | "staged" | "unstaged";

type ListItem =
  | { type: "header"; id: SectionId; label: string; count: number; conflict?: boolean }
  | { type: "row"; row: ChangeRow }
  | { type: "conflict-row"; row: ChangeRow };

const HEADER_HEIGHT_PX = 34;
const ROW_HEIGHT_PX = 36;
const CONFLICT_ROW_HEIGHT_PX = 36;

function estimateItemSize(item: ListItem | undefined): number {
  if (!item) return ROW_HEIGHT_PX;
  if (item.type === "header") return HEADER_HEIGHT_PX;
  if (item.type === "conflict-row") return CONFLICT_ROW_HEIGHT_PX;
  return ROW_HEIGHT_PX;
}

function buildListItems(
  conflictRows: ChangeRow[],
  stagedRows: ChangeRow[],
  unstagedRows: ChangeRow[],
  collapsed: ReadonlySet<SectionId>,
  labels: { conflicts: string; staged: string; unstaged: string },
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
      for (const row of stagedRows) items.push({ type: "row", row });
    }
  }

  if (unstagedRows.length > 0) {
    items.push({ type: "header", id: "unstaged", label: labels.unstaged, count: unstagedRows.length });
    if (!collapsed.has("unstaged")) {
      for (const row of unstagedRows) items.push({ type: "row", row });
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
  onSelect,
  onToggle,
  onDiscard,
  onBlame,
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
  onSelect: (id: string, shiftKey: boolean) => void;
  onToggle: (entry: StatusEntry, rowId: string) => void;
  onDiscard: (rowId: string) => void;
  onBlame: (path: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const openMergeEditor = useUiStore((s) => s.openMergeEditor);

  const [searchQuery, setSearchQuery] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<SectionId>>(new Set<SectionId>());

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
      }),
    [filteredConflictRows, filteredStagedRows, filteredUnstagedRows, collapsed, t, i18n.language],
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
      return item.row.id;
    },
  });

  const isEmpty =
    conflictRows.length === 0 && stagedRows.length === 0 && unstagedRows.length === 0;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-border/60 px-2.5 py-1.5">
        <button
          type="button"
          onClick={onToggleAll}
          className="flex shrink-0 items-center text-muted-foreground/50 hover:text-primary"
          title="Toggle all"
        >
          {allState === "checked" ? (
            <CheckSquare className="h-3.5 w-3.5 text-primary" />
          ) : allState === "indeterminate" ? (
            <MinusSquare className="h-3.5 w-3.5 text-primary/70" />
          ) : (
            <Square className="h-3.5 w-3.5" />
          )}
        </button>
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("commitPanel.fileListFilter")}
          className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/35"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="flex items-center text-muted-foreground/50 hover:text-muted-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
        {multiSelectedIds.size > 1 && (
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/60">
            {t("commitPanel.selectionCount", { count: multiSelectedIds.size })}
          </span>
        )}
        {conflictRows.length > 0 && (
          <button
            type="button"
            onClick={() => openMergeEditor(activePath)}
            className="ml-auto flex shrink-0 items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 hover:bg-amber-500/25 dark:text-amber-400"
          >
            <AlertTriangle className="h-2.5 w-2.5" />
            {conflictRows.length}
          </button>
        )}
        {onReload && (
          <button
            type="button"
            onClick={onReload}
            className="flex items-center text-muted-foreground/40 hover:text-muted-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/40">
          <p className="text-xs">{t("commitPanel.noChangesBrief")}</p>
        </div>
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
                return (
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
                        {isCollapsed
                          ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />
                          : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/40" />}
                        <span
                          className={
                            "text-xs font-medium " +
                            (item.conflict ? "text-amber-500" : "text-muted-foreground")
                          }
                        >
                          {item.label}
                        </span>
                      </span>
                      <div className="flex items-center gap-1">
                        {item.id === "staged" && onUnstageAll && (
                          <button
                            type="button"
                            title="Unstage all"
                            onClick={(e) => { e.stopPropagation(); onUnstageAll(); }}
                            className="hidden h-5 w-5 items-center justify-center rounded text-muted-foreground/50 hover:bg-muted hover:text-muted-foreground group-hover:flex"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                        )}
                        {item.id === "unstaged" && onStageAll && (
                          <button
                            type="button"
                            title="Stage all"
                            onClick={(e) => { e.stopPropagation(); onStageAll(); }}
                            className="hidden h-5 w-5 items-center justify-center rounded text-muted-foreground/50 hover:bg-muted hover:text-muted-foreground group-hover:flex"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        )}
                        <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                          {item.count}
                        </span>
                      </div>
                    </div>
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
          ? "bg-amber-500/15 text-foreground before:absolute before:left-0 before:top-0 before:h-full before:w-[2px] before:bg-amber-500"
          : "text-muted-foreground hover:bg-amber-500/10")
      }
    >
      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
      <span className="min-w-0 flex-1 truncate text-sm">
        <span className="font-medium">{row.path.split("/").pop()}</span>
        <span className="ml-1.5 truncate text-[11px] opacity-40">
          {row.path.split("/").slice(0, -1).join("/")}
        </span>
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openMergeEditor(activePath, row.path);
        }}
        className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-amber-600 ring-1 ring-amber-500/40 hover:bg-amber-500/20 dark:text-amber-400"
        title={t("commitPanel.openConflictEditor")}
      >
        <GitMerge className="h-3 w-3" />
        {t("commitPanel.resolveVerb")}
      </button>
    </div>
  );
}

export const VirtualFileList = memo(VirtualFileListInner);
