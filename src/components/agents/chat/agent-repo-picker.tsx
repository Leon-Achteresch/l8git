import { Check, ChevronsUpDown, FolderGit2, GitMerge, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAgentRepoPaths, useAgentRepoStore } from "@/lib/agents/agent-repo-store";
import {
  useAgentWorktreeStore,
  worktreeDisplayName,
} from "@/lib/agents/agent-worktrees";
import { useRepoStore } from "@/lib/repo-store";

function repoName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function AgentRepoPicker({ selectedPath }: { selectedPath: string }) {
  const { t } = useTranslation();
  const paths = useAgentRepoPaths();
  const setPath = useAgentRepoStore((state) => state.setPath);
  const branches = useRepoStore((state) => state.repos);
  const worktrees = useAgentWorktreeStore((state) => state.worktrees);
  const createWorktree = useAgentWorktreeStore((state) => state.createWorktree);
  const removeWorktree = useAgentWorktreeStore((state) => state.removeWorktree);
  const landWorktree = useAgentWorktreeStore((state) => state.landWorktree);
  const [pending, setPending] = useState(false);
  const basePath = worktrees[selectedPath]?.basePath ?? selectedPath;
  const repoPaths = paths.filter((path) => !worktrees[path]);
  const worktreeEntries = Object.values(worktrees).sort((a, b) => b.createdAt - a.createdAt);

  const newWorktree = async () => {
    if (pending || !basePath) return;
    setPending(true);
    try {
      const entry = await createWorktree(basePath);
      setPath(entry.path);
      toast.success(t("agentChat.worktreeCreated", { branch: entry.branch }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  };

  const mergeWorktree = async (path: string) => {
    const base = worktrees[path]?.basePath;
    try {
      await landWorktree(path);
      toast.success(t("agentChat.worktreeLanded", { name: worktreeDisplayName(path) }));
      if (base && selectedPath === path) setPath(base);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const deleteWorktree = async (path: string) => {
    try {
      await removeWorktree(path);
    } catch {
      if (!window.confirm(t("agentChat.worktreeForceConfirm", { name: worktreeDisplayName(path) }))) return;
      try {
        await removeWorktree(path, { force: true });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
        return;
      }
    }
    if (selectedPath === path) setPath(basePath === path ? repoPaths[0] ?? "" : basePath);
  };

  if (!selectedPath && paths.length === 0) {
    return (
      <h2 className="min-w-0 truncate text-[13px] font-semibold tracking-[-0.01em] text-[var(--ag-text)]">
        {t("header.agents")}
      </h2>
    );
  }

  return (
    <div className="min-w-0 flex-1">
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="ag-row -ml-0.5 h-8 min-w-0 w-full gap-2 text-[13px]"
          aria-label={t("agentChat.switchRepo")}
          title={selectedPath}
        >
          <span className="ag-mark size-6">
            <FolderGit2 className="size-3" />
          </span>
          <span className="min-w-0 flex-1 truncate text-left font-semibold tracking-[-0.01em]">
            {repoName(selectedPath)}
          </span>
          <ChevronsUpDown className="ag-faint size-3 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="ag-menu w-72 p-1.5">
        <DropdownMenuLabel className="ag-label">{t("agentChat.switchRepo")}</DropdownMenuLabel>
        {repoPaths.map((path) => (
          <DropdownMenuItem
            key={path}
            onSelect={() => setPath(path)}
            className="ag-menu-item text-[12px] focus:bg-[var(--ag-hover)]"
            title={path}
          >
            <span className="min-w-0 flex-1 truncate">{repoName(path)}</span>
            {branches[path]?.branch ? (
              <span className="ag-faint max-w-20 truncate text-[10px]">
                {branches[path]?.branch}
              </span>
            ) : null}
            {path === selectedPath ? <Check className="size-3.5 shrink-0" /> : null}
          </DropdownMenuItem>
        ))}
        {worktreeEntries.length > 0 ? (
          <>
            <DropdownMenuSeparator className="ag-line my-1" />
            <DropdownMenuLabel className="ag-label">{t("agentChat.worktrees")}</DropdownMenuLabel>
            {worktreeEntries.map((entry) => (
              <DropdownMenuItem
                key={entry.path}
                onSelect={() => setPath(entry.path)}
                className="ag-menu-item text-[12px] focus:bg-[var(--ag-hover)]"
                title={`${entry.path} · ${entry.branch}`}
              >
                <FolderGit2 className="ag-faint size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{worktreeDisplayName(entry.path)}</span>
                <span className="ag-faint max-w-24 truncate text-[10px]">
                  {repoName(entry.basePath)}
                </span>
                {entry.path === selectedPath ? <Check className="size-3.5 shrink-0" /> : null}
                <button
                  type="button"
                  aria-label={t("agentChat.landWorktree", { name: worktreeDisplayName(entry.path) })}
                  title={t("agentChat.landWorktree", { name: worktreeDisplayName(entry.path) })}
                  className="ag-icon-btn size-5 shrink-0"
                  onClick={(event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    void mergeWorktree(entry.path);
                  }}
                >
                  <GitMerge className="size-3" />
                </button>
                <button
                  type="button"
                  aria-label={t("agentChat.removeWorktree", { name: worktreeDisplayName(entry.path) })}
                  className="ag-icon-btn size-5 shrink-0"
                  onClick={(event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    void deleteWorktree(entry.path);
                  }}
                >
                  <Trash2 className="size-3" />
                </button>
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
        <DropdownMenuSeparator className="ag-line my-1" />
        <DropdownMenuItem
          disabled={pending || !basePath}
          onSelect={() => void newWorktree()}
          className="ag-menu-item text-[12px] focus:bg-[var(--ag-hover)]"
        >
          <Plus className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {t("agentChat.newWorktree", { repo: repoName(basePath) })}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    </div>
  );
}
