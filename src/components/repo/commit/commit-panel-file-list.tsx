import type { StatusEntry } from "@/lib/repo-store";
import { useUiStore } from "@/lib/ui-store";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertTriangle, Check, CheckSquare, GitMerge, MinusSquare, Square } from "lucide-react";
import { memo, useMemo, useRef } from "react";
import { FileRow } from "./commit-panel-file-row";
import type { ChangeRow, CheckState } from "./commit-panel-types";

type ListItem =
  | { type: "header"; label: string; count: number; conflict?: boolean }
  | { type: "row"; row: ChangeRow }
  | { type: "conflict-row"; row: ChangeRow }
  | { type: "gap" };

const HEADER_HEIGHT_PX = 28;
const ROW_HEIGHT_PX = 36;
const CONFLICT_ROW_HEIGHT_PX = 36;
const GAP_HEIGHT_PX = 8;

function estimateItemSize(item: ListItem | undefined): number {
  if (!item) return ROW_HEIGHT_PX;
  if (item.type === "header") return HEADER_HEIGHT_PX;
  if (item.type === "gap") return GAP_HEIGHT_PX;
  if (item.type === "conflict-row") return CONFLICT_ROW_HEIGHT_PX;
  return ROW_HEIGHT_PX;
}

function buildListItems(
  conflictRows: ChangeRow[],
  stagedRows: ChangeRow[],
  unstagedRows: ChangeRow[],
): ListItem[] {
  const items: ListItem[] = [];

  if (conflictRows.length > 0) {
    items.push({ type: "header", label: "Konflikte", count: conflictRows.length, conflict: true });
    for (const row of conflictRows) {
      items.push({ type: "conflict-row", row });
    }
    if (stagedRows.length > 0 || unstagedRows.length > 0) {
      items.push({ type: "gap" });
    }
  }

  if (stagedRows.length > 0) {
    items.push({ type: "header", label: "Gestaged", count: stagedRows.length });
    for (const row of stagedRows) {
      items.push({ type: "row", row });
    }
  }
  if (unstagedRows.length > 0) {
    if (stagedRows.length > 0) {
      items.push({ type: "gap" });
    }
    items.push({ type: "header", label: "Nicht gestaged", count: unstagedRows.length });
    for (const row of unstagedRows) {
      items.push({ type: "row", row });
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
  onSelect,
  onToggle,
  onDiscard,
  onBlame,
}: {
  conflictRows: ChangeRow[];
  stagedRows: ChangeRow[];
  unstagedRows: ChangeRow[];
  selectedRowId: string | null;
  /** Set of row IDs highlighted as part of a Shift range selection. */
  multiSelectedIds: ReadonlySet<string>;
  allState: CheckState;
  activePath: string;
  onToggleAll: () => void;
  onSelect: (id: string, shiftKey: boolean) => void;
  onToggle: (entry: StatusEntry, rowId: string) => void;
  onDiscard: (path: string) => void;
  onBlame: (path: string) => void;
}) {
  const openMergeEditor = useUiStore((s) => s.openMergeEditor);

  const listItems = useMemo(
    () => buildListItems(conflictRows, stagedRows, unstagedRows),
    [conflictRows, stagedRows, unstagedRows],
  );

  const scrollerRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: listItems.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: (index) => estimateItemSize(listItems[index]),
    overscan: 12,
    paddingStart: 4,
    paddingEnd: 4,
    getItemKey: (index) => {
      const item = listItems[index];
      if (!item) return index;
      if (item.type === "header") return `h-${item.label}`;
      if (item.type === "gap") return "gap";
      return item.row.id;
    },
  });

  const isEmpty = conflictRows.length === 0 && stagedRows.length === 0 && unstagedRows.length === 0;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5">
        <div className="flex cursor-pointer items-center justify-center" onClick={onToggleAll}>
          {allState === "checked" ? (
            <CheckSquare className="h-[18px] w-[18px] text-primary" />
          ) : allState === "indeterminate" ? (
            <MinusSquare className="h-[18px] w-[18px] text-primary/70" />
          ) : (
            <Square className="h-[18px] w-[18px] text-muted-foreground/40" />
          )}
        </div>
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Alle Dateien
        </span>
        {conflictRows.length > 0 && (
          <button
            type="button"
            onClick={() => openMergeEditor(activePath)}
            className="ml-auto flex items-center gap-1.5 rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-600 hover:bg-amber-500/25 dark:text-amber-400"
          >
            <AlertTriangle className="h-3 w-3" />
            {conflictRows.length} Konflikt{conflictRows.length !== 1 ? "e" : ""}
          </button>
        )}
        {conflictRows.length === 0 && multiSelectedIds.size > 1 && (
          <span className="ml-auto text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">{multiSelectedIds.size}</span> ausgewählt
          </span>
        )}
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/60">
          <Check className="mb-2 h-6 w-6 opacity-40" />
          <p className="text-xs">Keine Änderungen</p>
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

              if (item.type === "gap") {
                return <div key={vi.key} style={style} />;
              }

              if (item.type === "header") {
                return (
                  <div
                    key={vi.key}
                    style={style}
                    className={
                      "flex items-center justify-between px-4 text-[11px] font-medium uppercase tracking-wide " +
                      (item.conflict
                        ? "text-amber-500"
                        : "text-muted-foreground")
                    }
                  >
                    <span className="flex items-center gap-1.5">
                      {item.conflict && <AlertTriangle className="h-3 w-3" />}
                      {item.label}
                    </span>
                    <span className="tabular-nums">{item.count}</span>
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
  const openMergeEditor = useUiStore((s) => s.openMergeEditor);

  return (
    <div
      onClick={(e) => {
        if (e.shiftKey) e.preventDefault();
        onSelect(row.id, e.shiftKey);
      }}
      className={
        "group relative flex cursor-pointer select-none items-center gap-2 px-4 py-2 text-sm transition-colors " +
        (selected
          ? "bg-amber-500/15 text-foreground before:absolute before:left-0 before:top-0 before:h-full before:w-[2px] before:bg-amber-500"
          : "text-muted-foreground hover:bg-amber-500/10")
      }
    >
      <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-500" />
      <span className="min-w-0 flex-1 truncate text-sm">
        <span className="font-medium">{row.path.split("/").pop()}</span>
        <span className="ml-2 truncate text-[11px] opacity-50">
          {row.path.split("/").slice(0, -1).join("/")}
        </span>
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openMergeEditor(activePath);
        }}
        className="ml-auto flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium text-amber-600 ring-1 ring-amber-500/40 hover:bg-amber-500/20 dark:text-amber-400"
        title="Merge-Konflikt-Editor öffnen"
      >
        <GitMerge className="h-3 w-3" />
        Lösen
      </button>
    </div>
  );
}

export const VirtualFileList = memo(VirtualFileListInner);
