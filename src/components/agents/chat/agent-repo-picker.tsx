import { Check, ChevronsUpDown, GitBranch } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAgentRepoPaths, useAgentRepoStore } from "@/lib/agents/agent-repo-store";
import { useRepoStore } from "@/lib/repo-store";

function repoName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function AgentRepoPicker({ selectedPath }: { selectedPath: string }) {
  const { t } = useTranslation();
  const paths = useAgentRepoPaths();
  const setPath = useAgentRepoStore((state) => state.setPath);
  const branches = useRepoStore((state) => state.repos);
  const branch = branches[selectedPath]?.branch;

  if (paths.length <= 1) {
    return (
      <h2 className="min-w-0 truncate text-[13px] font-semibold tracking-[-0.01em] text-[var(--ag-text)]">
        {selectedPath ? repoName(selectedPath) : t("header.agents")}
      </h2>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="ag-row -ml-1.5 h-8 min-w-0 flex-1 text-[13px]"
          aria-label={t("agentChat.switchRepo")}
          title={selectedPath}
        >
          <span className="min-w-0 flex-1 truncate text-left font-semibold tracking-[-0.01em]">
            {repoName(selectedPath)}
          </span>
          {branch ? (
            <span className="ag-faint hidden min-w-0 max-w-24 items-center gap-1 text-[11px] sm:flex">
              <GitBranch className="size-3 shrink-0" />
              <span className="truncate">{branch}</span>
            </span>
          ) : null}
          <ChevronsUpDown className="ag-faint size-3 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="ag-menu w-64 p-1.5">
        <DropdownMenuLabel className="ag-label">{t("agentChat.switchRepo")}</DropdownMenuLabel>
        {paths.map((path) => (
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
