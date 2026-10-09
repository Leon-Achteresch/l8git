import {
  ContextMenuContent,
  ContextMenuItem,
} from "@/components/ui/context-menu";
import type { StatusEntry } from "@/lib/repo-store";
import {
  CheckSquare,
  EyeOff,
  GitCommitHorizontal,
  Square,
  Undo2,
} from "lucide-react";
import { memo, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { StatusIcon } from "./commit-panel-status-icon";
import type { ChangeRow } from "./commit-panel-types";

function FileRowInner({
  row,
  selected,
  inMultiSelection,
  onSelect,
  onToggle,
  depth,
}: {
  row: ChangeRow;
  selected: boolean;
  inMultiSelection: boolean;
  onSelect: (id: string, shiftKey: boolean) => void;
  onToggle: (entry: StatusEntry, rowId: string) => void;
  depth?: number;
}) {
  const { t } = useTranslation();
  const checked = row.sector === "staged";
  const toggleLabel = t(checked ? "commitActions.unstageFile" : "commitActions.stageFile", { path: row.path });
  const separator = row.path.lastIndexOf("/");
  const fileName = row.path.slice(separator + 1);
  const directory = separator === -1 ? "" : row.path.slice(0, separator);
  const additions =
    row.sector === "staged" ? row.entry.additions_staged : row.entry.additions_unstaged;
  const deletions =
    row.sector === "staged" ? row.entry.deletions_staged : row.entry.deletions_unstaged;

  const rowClass =
    "group relative flex h-full cursor-pointer items-center gap-3 px-4 py-2 text-sm transition-colors " +
    (selected
      ? "bg-accent/40 text-foreground before:absolute before:left-0 before:top-0 before:h-full before:w-[2px] before:bg-primary"
      : inMultiSelection
        ? "bg-accent/20 text-foreground"
        : "text-muted-foreground hover:bg-muted/30 hover:text-foreground");

  return (
    <div
      data-change-row-id={row.id}
      tabIndex={0}
      onClick={(e) => {
        if (e.shiftKey) e.preventDefault();
        onSelect(row.id, e.shiftKey);
      }}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onSelect(row.id, event.shiftKey);
        }
      }}
      className={rowClass + " select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"}
      style={depth === undefined ? undefined : { paddingLeft: 16 + depth * 14 }}
    >
      <button
        type="button"
        className="flex items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40"
        disabled={row.entry.embedded_repo || row.sector === "conflict"}
        aria-label={toggleLabel}
        title={toggleLabel}
        aria-pressed={checked}
        onClick={(e) => {
          e.stopPropagation();
          if (!row.entry.embedded_repo) onToggle(row.entry, row.id);
        }}
      >
        {checked ? (
          <CheckSquare className="h-[18px] w-[18px] text-primary" />
        ) : (
          <Square className="h-[18px] w-[18px] text-muted-foreground/40 group-hover:text-muted-foreground" />
        )}
      </button>
      <StatusIcon entry={row.entry} sector={row.sector} />
      <span className="min-w-0 flex-1 truncate text-sm">
        <span className="font-medium">{fileName}</span>
        {row.entry.embedded_repo && <EmbeddedRepoBadge />}
        {depth === undefined && (
          <span className="ml-2 truncate text-[0.6875rem] opacity-50">
            {directory}
          </span>
        )}
      </span>
      <div className="flex shrink-0 items-center gap-2 font-mono text-[0.6875rem] tabular-nums">
        {!row.entry.binary && (
          <>
            {additions > 0 && <span className="text-git-added">+{additions}</span>}
            {deletions > 0 && <span className="text-git-removed">−{deletions}</span>}
          </>
        )}
      </div>
    </div>
  );
}

function EmbeddedRepoBadge() {
  const { t } = useTranslation();
  return (
    <span className="ml-2 rounded bg-git-merge/15 px-1 py-0.5 text-[0.625rem] font-medium text-git-merge">
      {t("commitPanel.embeddedRepo")}
    </span>
  );
}

export function FileRowMenu({
  row,
  inMultiSelection,
  multiSelectedCount,
  onDiscard,
  onBlame,
  onIgnore,
  onCloseAutoFocus,
}: {
  row: ChangeRow;
  inMultiSelection: boolean;
  multiSelectedCount: number;
  onDiscard: (rowId: string) => void;
  onBlame: (path: string) => void;
  onIgnore?: (patterns: string[]) => void;
  onCloseAutoFocus?: ComponentProps<typeof ContextMenuContent>["onCloseAutoFocus"];
}) {
  const { t } = useTranslation();
  const canBlame = !row.entry.untracked && row.entry.index_status !== "A";
  return (
    <ContextMenuContent onCloseAutoFocus={onCloseAutoFocus}>
      {canBlame && (
        <ContextMenuItem onSelect={() => onBlame(row.path)}>
          <GitCommitHorizontal className="h-3.5 w-3.5" />
          {t("commitPanel.fileRowBlame")}
        </ContextMenuItem>
      )}
      {onIgnore && (
        <ContextMenuItem onSelect={() => onIgnore([row.path])}>
          <EyeOff className="h-3.5 w-3.5" />
          {t("commitPanel.fileRowIgnore")}
        </ContextMenuItem>
      )}
      <ContextMenuItem disabled={row.entry.embedded_repo || row.sector === "conflict"} variant="destructive" onSelect={() => onDiscard(row.id)}>
        <Undo2 className="h-3.5 w-3.5" />
        {inMultiSelection && multiSelectedCount > 1
          ? t("commitPanel.fileRowDiscardMultiple", { count: multiSelectedCount })
          : t("commitPanel.fileRowDiscard")}
      </ContextMenuItem>
    </ContextMenuContent>
  );
}

export const FileRow = memo(FileRowInner);
