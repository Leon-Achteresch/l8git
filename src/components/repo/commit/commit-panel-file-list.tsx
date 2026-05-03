import type { StatusEntry } from "@/lib/repo-store";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Check, CheckSquare, MinusSquare, Square } from "lucide-react";
import { memo, useMemo, useRef } from "react";
import { FileRow } from "./commit-panel-file-row";
import type { ChangeRow, CheckState } from "./commit-panel-types";

type ListItem =
  | { type: "header"; label: string; count: number }
  | { type: "row"; row: ChangeRow }
  | { type: "gap" };

const HEADER_HEIGHT_PX = 28;
const ROW_HEIGHT_PX = 36;
const GAP_HEIGHT_PX = 8;

function estimateItemSize(item: ListItem | undefined): number {
  if (!item) return ROW_HEIGHT_PX;
  if (item.type === "header") return HEADER_HEIGHT_PX;
  if (item.type === "gap") return GAP_HEIGHT_PX;
  return ROW_HEIGHT_PX;
}

function buildListItems(stagedRows: ChangeRow[], unstagedRows: ChangeRow[]): ListItem[] {
  const items: ListItem[] = [];
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
  stagedRows,
  unstagedRows,
  selectedRowId,
  allState,
  onToggleAll,
  onSelect,
  onToggle,
  onDiscard,
  onBlame,
}: {
  stagedRows: ChangeRow[];
  unstagedRows: ChangeRow[];
  selectedRowId: string | null;
  allState: CheckState;
  onToggleAll: () => void;
  onSelect: (id: string) => void;
  onToggle: (entry: StatusEntry) => void;
  onDiscard: (path: string) => void;
  onBlame: (path: string) => void;
}) {
  const listItems = useMemo(
    () => buildListItems(stagedRows, unstagedRows),
    [stagedRows, unstagedRows],
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

  const isEmpty = stagedRows.length === 0 && unstagedRows.length === 0;

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
                    className="flex items-center justify-between px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    <span>{item.label}</span>
                    <span className="tabular-nums">{item.count}</span>
                  </div>
                );
              }

              return (
                <div key={vi.key} style={style}>
                  <FileRow
                    row={item.row}
                    selected={item.row.id === selectedRowId}
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

export const VirtualFileList = memo(VirtualFileListInner);
