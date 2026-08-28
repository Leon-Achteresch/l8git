import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { repoAvatarHue, repoInitialChar } from "@/lib/repo-avatar";
import { useRepoStore } from "@/lib/repo-store";
import { useWorkspaceStore } from "@/lib/workspace-store";
import { Layers } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";

/**
 * Verschiebt die uebergebenen Repos (ein Tab oder alle Repos eines Ordners)
 * in einen anderen Workspace.
 */
export function RepoWorkspaceMoveActions({ paths }: { paths: string[] }) {
  const { t } = useTranslation();
  const { workspaces, activeWorkspaceId } = useWorkspaceStore(
    useShallow((s) => ({
      workspaces: s.workspaces,
      activeWorkspaceId: s.activeWorkspaceId,
    })),
  );

  const moveTo = useCallback(
    (workspaceId: string) => {
      useWorkspaceStore.getState().moveReposToWorkspace(paths, workspaceId);

      const { activePath, paths: openPaths } = useRepoStore.getState();
      if (!activePath || !paths.includes(activePath)) return;
      const { workspaces: next, activeWorkspaceId: currentId } =
        useWorkspaceStore.getState();
      const remaining =
        next.find((w) => w.id === currentId)?.repoPaths ?? [];
      const fallback = remaining.find((p) => openPaths.includes(p));
      if (fallback) useRepoStore.getState().setActive(fallback);
    },
    [paths],
  );

  const targets = workspaces.filter((w) => w.id !== activeWorkspaceId);
  if (paths.length === 0 || targets.length === 0) return null;

  return (
    <>
      <ContextMenuSeparator />
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Layers className="h-3.5 w-3.5" />
          {t("repoWorkspaceSwitch.moveToWorkspace")}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="max-h-64 overflow-y-auto">
          {targets.map((ws) => (
            <ContextMenuItem key={ws.id} onSelect={() => moveTo(ws.id)}>
              <span
                className="flex size-4 shrink-0 items-center justify-center rounded-[4px] text-[9px] font-bold text-white"
                style={{
                  backgroundColor: `hsl(${repoAvatarHue(ws.name)} 52% 40%)`,
                }}
                aria-hidden
              >
                {repoInitialChar(ws.name)}
              </span>
              <span className="truncate">{ws.name}</span>
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>
    </>
  );
}
