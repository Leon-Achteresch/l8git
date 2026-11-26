import { collectFolderPaths, type ChangeTreeNode } from "@/lib/change-tree";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ChevronDown as ChevronDownData, ChevronRight as ChevronRightData } from "lucide";
import { EyeOff, Folder, Minus, Plus, Undo2 } from "lucide-react";
import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import { MorphIcon } from "@/components/ui/morph-icon";

function FolderRowInner({
  folder,
  depth,
  collapsed,
  sector,
  onToggleCollapsed,
  onStage,
  onUnstage,
  onDiscard,
  onIgnore,
}: {
  folder: ChangeTreeNode;
  depth: number;
  collapsed: boolean;
  sector: "staged" | "unstaged";
  onToggleCollapsed: () => void;
  onStage?: (paths: string[]) => void;
  onUnstage?: (paths: string[]) => void;
  onDiscard?: (paths: string[], worktreeOnly: boolean) => void;
  onIgnore?: (patterns: string[]) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const inner = (
    <button
      type="button"
      aria-expanded={!collapsed}
      onClick={onToggleCollapsed}
      style={{ paddingLeft: 16 + depth * 14 }}
      className="group flex h-full w-full cursor-pointer select-none items-center gap-2 pr-4 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
    >
      <MorphIcon
        icon={collapsed ? ChevronRightData : ChevronDownData}
        className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40"
      />
      <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
      <span className="min-w-0 flex-1 truncate font-medium">{folder.name}</span>
      <span className="shrink-0 font-mono text-[0.6875rem] tabular-nums opacity-40">{folder.fileCount}</span>
    </button>
  );

  return (
    <ContextMenu onOpenChange={setMenuOpen}>
      <ContextMenuTrigger asChild>{inner}</ContextMenuTrigger>
      {menuOpen && (
        <FolderRowMenu
          folder={folder}
          sector={sector}
          onStage={onStage}
          onUnstage={onUnstage}
          onDiscard={onDiscard}
          onIgnore={onIgnore}
        />
      )}
    </ContextMenu>
  );
}

function FolderRowMenu({
  folder,
  sector,
  onStage,
  onUnstage,
  onDiscard,
  onIgnore,
}: {
  folder: ChangeTreeNode;
  sector: "staged" | "unstaged";
  onStage?: (paths: string[]) => void;
  onUnstage?: (paths: string[]) => void;
  onDiscard?: (paths: string[], worktreeOnly: boolean) => void;
  onIgnore?: (patterns: string[]) => void;
}) {
  const { t } = useTranslation();
  return (
    <ContextMenuContent>
      {sector === "unstaged" && onStage && (
        <ContextMenuItem onSelect={() => onStage(collectFolderPaths(folder))}>
          <Plus className="h-3.5 w-3.5" />
          {t("commitPanel.folderStage")}
        </ContextMenuItem>
      )}
      {sector === "staged" && onUnstage && (
        <ContextMenuItem onSelect={() => onUnstage(collectFolderPaths(folder))}>
          <Minus className="h-3.5 w-3.5" />
          {t("commitPanel.folderUnstage")}
        </ContextMenuItem>
      )}
      {onIgnore && (
        <ContextMenuItem onSelect={() => onIgnore([`${folder.path}/`])}>
          <EyeOff className="h-3.5 w-3.5" />
          {t("commitPanel.folderIgnore")}
        </ContextMenuItem>
      )}
      {onDiscard && (
        <ContextMenuItem
          variant="destructive"
          onSelect={() => onDiscard(collectFolderPaths(folder), sector === "unstaged")}
        >
          <Undo2 className="h-3.5 w-3.5" />
          {t("commitPanel.folderDiscard")}
        </ContextMenuItem>
      )}
    </ContextMenuContent>
  );
}

export const FolderRow = memo(FolderRowInner);
