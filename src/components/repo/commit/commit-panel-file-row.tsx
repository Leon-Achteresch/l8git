import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { StatusEntry } from "@/lib/repo-store";
import {
  CheckSquare,
  GitCommitHorizontal,
  MinusSquare,
  Square,
  Undo2,
} from "lucide-react";
import { memo } from "react";
import { StatusIcon } from "./commit-panel-status-icon";
import { checkState, type ChangeRow } from "./commit-panel-types";

function FileRowInner({
  row,
  selected,
  inMultiSelection,
  onSelect,
  onToggle,
  onDiscard,
  onBlame,
}: {
  row: ChangeRow;
  /** True when this row is the active diff-preview row. */
  selected: boolean;
  /** True when this row is part of a Shift-range selection. */
  inMultiSelection: boolean;
  onSelect: (id: string, shiftKey: boolean) => void;
  onToggle: (entry: StatusEntry, rowId: string) => void;
  onDiscard: (path: string) => void;
  onBlame: (path: string) => void;
}) {
  const state = checkState(row.entry);
  const additions =
    row.sector === "staged" ? row.entry.additions_staged : row.entry.additions_unstaged;
  const deletions =
    row.sector === "staged" ? row.entry.deletions_staged : row.entry.deletions_unstaged;

  // Visual state priority:
  //  selected + inMultiSelection → accent with left bar (stronger)
  //  selected only              → accent with left bar (normal)
  //  inMultiSelection only      → soft accent (range highlight)
  //  none                       → hover only
  const rowClass =
    "group relative flex cursor-pointer items-center gap-3 px-4 py-2 text-sm transition-colors " +
    (selected
      ? "bg-accent/40 text-foreground before:absolute before:left-0 before:top-0 before:h-full before:w-[2px] before:bg-primary"
      : inMultiSelection
        ? "bg-accent/20 text-foreground"
        : "text-muted-foreground hover:bg-muted/30 hover:text-foreground");

  const inner = (
    <div
      onClick={(e) => {
        // Prevent the browser from extending the text selection on Shift+Click.
        if (e.shiftKey) e.preventDefault();
        onSelect(row.id, e.shiftKey);
      }}
      className={rowClass + " select-none"}
    >
      <div
        className="flex items-center justify-center"
        onClick={(e) => {
          e.stopPropagation();
          onToggle(row.entry, row.id);
        }}
      >
        {state === "checked" ? (
          <CheckSquare className="h-[18px] w-[18px] text-primary" />
        ) : state === "indeterminate" ? (
          <MinusSquare className="h-[18px] w-[18px] text-primary/70" />
        ) : (
          <Square className="h-[18px] w-[18px] text-muted-foreground/40 group-hover:text-muted-foreground" />
        )}
      </div>
      <StatusIcon entry={row.entry} sector={row.sector} />
      <span className="min-w-0 flex-1 truncate text-sm">
        <span className="font-medium">{row.path.split("/").pop()}</span>
        <span className="ml-2 truncate text-[11px] opacity-50">
          {row.path.split("/").slice(0, -1).join("/")}
        </span>
      </span>
      <div className="flex shrink-0 items-center gap-2 font-mono text-[11px] tabular-nums">
        {!row.entry.binary && (
          <>
            {additions > 0 && <span className="text-git-added">+{additions}</span>}
            {deletions > 0 && <span className="text-git-removed">−{deletions}</span>}
          </>
        )}
      </div>
    </div>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{inner}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => onBlame(row.path)}>
          <GitCommitHorizontal className="h-3.5 w-3.5" />
          Git Blame anzeigen
        </ContextMenuItem>
        <ContextMenuItem variant="destructive" onSelect={() => onDiscard(row.path)}>
          <Undo2 className="h-3.5 w-3.5" />
          Änderungen verwerfen
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export const FileRow = memo(FileRowInner);
