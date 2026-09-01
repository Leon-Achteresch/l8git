import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ChevronDown as ChevronDownData, ChevronRight as ChevronRightData } from "lucide";
import { EyeOff, Folder, Minus, Plus, Undo2 } from "lucide-react";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { MorphIcon } from "@/components/ui/morph-icon";

function FolderRowInner({
  name,
  path,
  depth,
  paths,
  collapsed,
  sector,
  fileCount,
  onToggleCollapsed,
  onStage,
  onUnstage,
  onDiscard,
  onIgnore,
}: {
  name: string;
  path: string;
  depth: number;
  paths: string[];
  collapsed: boolean;
  sector: "staged" | "unstaged";
  fileCount: number;
  onToggleCollapsed: () => void;
  onStage?: (paths: string[]) => void;
  onUnstage?: (paths: string[]) => void;
  onDiscard?: (paths: string[], worktreeOnly: boolean) => void;
  onIgnore?: (patterns: string[]) => void;
}) {
  const { t } = useTranslation();

  const inner = (
    <div
      onClick={onToggleCollapsed}
      style={{ paddingLeft: 16 + depth * 14 }}
      className="group flex h-full cursor-pointer select-none items-center gap-2 pr-4 text-sm text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
    >
      <MorphIcon
        icon={collapsed ? ChevronRightData : ChevronDownData}
        className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40"
      />
      <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
      <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
      <span className="shrink-0 font-mono text-[11px] tabular-nums opacity-40">{fileCount}</span>
    </div>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{inner}</ContextMenuTrigger>
      <ContextMenuContent>
        {sector === "unstaged" && onStage && (
          <ContextMenuItem onSelect={() => onStage(paths)}>
            <Plus className="h-3.5 w-3.5" />
            {t("commitPanel.folderStage")}
          </ContextMenuItem>
        )}
        {sector === "staged" && onUnstage && (
          <ContextMenuItem onSelect={() => onUnstage(paths)}>
            <Minus className="h-3.5 w-3.5" />
            {t("commitPanel.folderUnstage")}
          </ContextMenuItem>
        )}
        {onIgnore && (
          <ContextMenuItem onSelect={() => onIgnore([`${path}/`])}>
            <EyeOff className="h-3.5 w-3.5" />
            {t("commitPanel.folderIgnore")}
          </ContextMenuItem>
        )}
        {onDiscard && (
          <ContextMenuItem
            variant="destructive"
            onSelect={() => onDiscard(paths, sector === "unstaged")}
          >
            <Undo2 className="h-3.5 w-3.5" />
            {t("commitPanel.folderDiscard")}
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

export const FolderRow = memo(FolderRowInner);
