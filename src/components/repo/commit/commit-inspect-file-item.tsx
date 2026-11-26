import { Checkbox } from "@/components/ui/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  FileCode2,
  GitCommitHorizontal,
  Minus,
  Plus,
  Undo2,
} from "lucide-react";
import { memo } from "react";
import { useRowT } from "@/lib/i18n";

export type CommitChangedFile = {
  untracked?: boolean;
  previous_path?: string | null;
  path: string;
  additions: number;
  deletions: number;
  binary: boolean;
};

export const CommitInspectFileItem = memo(function CommitInspectFileItem({
  file,
  isSelected,
  isChecked,
  onSelect,
  onBlame,
  onDiscard,
  onCheckedChange,
}: {
  file: CommitChangedFile;
  isSelected: boolean;
  isChecked?: boolean;
  onSelect: (path: string | null) => void;
  onBlame?: (path: string) => void;
  onDiscard?: (path: string) => void;
  onCheckedChange?: (path: string, checked: boolean) => void;
}) {
  const t = useRowT();
  const slash = file.path.lastIndexOf("/");
  const baseName = file.path.slice(slash + 1);
  const directory = slash >= 0 ? file.path.slice(0, slash) : "";

  const inner = (
    <button
      type="button"
      title={file.previous_path ? `${file.previous_path} → ${file.path}` : file.path}
      aria-pressed={isSelected}
      onClick={() => onSelect(isSelected ? null : file.path)}
      className={`group grid min-w-0 flex-1 cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-0.5 rounded-lg px-2 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring @[15rem]:grid-cols-[auto_minmax(0,1fr)_auto] ${
        isSelected ? "bg-primary/15 text-primary ring-1 ring-primary/20" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      }`}
    >
      <FileCode2
        className={`h-4 w-4 shrink-0 transition-transform ${
          isSelected
            ? "scale-110 text-primary"
            : "opacity-60 group-hover:opacity-100"
        }`}
      />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-semibold tracking-tight">
          {baseName}
        </span>
        {file.previous_path ? <span className="truncate text-[0.625rem] text-muted-foreground">{t("pr.previousPath", { path: file.previous_path })}</span> : null}
        {directory ? (
          <span className="truncate text-[0.625rem] font-medium opacity-60">
            {directory}
          </span>
        ) : null}
      </span>
      <span className="col-start-2 flex min-w-0 flex-wrap items-center gap-x-2 text-xs font-medium @[15rem]:col-start-3">
        {file.untracked && <span className="text-xs text-muted-foreground">{t("audit.untracked")}</span>}
        {file.binary ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[0.625rem] uppercase tracking-wider text-muted-foreground">
            {t("commitInspect.binaryBadge")}
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            {file.additions > 0 ? (
              <span className="flex items-center gap-0.5 text-git-added">
                <Plus className="h-3 w-3" />
                {file.additions}
              </span>
            ) : null}
            {file.deletions > 0 ? (
              <span className="flex items-center gap-0.5 text-git-removed">
                <Minus className="h-3 w-3" />
                {file.deletions}
              </span>
            ) : null}
            {file.additions === 0 && file.deletions === 0 ? (
              <span className="text-muted-foreground opacity-50">0</span>
            ) : null}
          </span>
        )}
      </span>
    </button>
  );

  const action = !onBlame && !onDiscard ? inner : (
    <ContextMenu deferMount>
      <ContextMenuTrigger asChild>{inner}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onSelect={onBlame ? () => onBlame(file.path) : undefined}
          disabled={!onBlame}
        >
          <GitCommitHorizontal className="h-3.5 w-3.5" />
          {t("commitPanel.fileRowBlame")}
        </ContextMenuItem>
        <ContextMenuItem
          variant="destructive"
          onSelect={onDiscard ? () => onDiscard(file.path) : undefined}
          disabled={!onDiscard}
        >
          <Undo2 className="h-3.5 w-3.5" />
          {t("commitInspect.fileResetMenu")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
  return (
    <div className="@container flex min-w-0 items-center gap-1">
      {onCheckedChange && <Checkbox aria-label={file.path} checked={!!isChecked}
        onCheckedChange={checked => onCheckedChange(file.path, !!checked)} />}
      {action}
    </div>
  );
});
