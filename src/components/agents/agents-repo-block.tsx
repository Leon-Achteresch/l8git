import { GitBranch } from "lucide-react";
import { LayoutGroup } from "motion/react";

import { AgentsDiffStat } from "@/components/agents/agents-diff-stat";
import { AgentsLaunchMenu } from "@/components/agents/agents-launch-menu";
import { AgentsSessionRow } from "@/components/agents/agents-session-row";
import {
  AGENTS_EMPTY_STATUS,
  agentsDiffTotals,
  agentsRepoName,
  type AgentsSelection,
} from "@/components/agents/agents-types";
import { agentTabs } from "@/lib/agent-integrations";
import { useRepoStore } from "@/lib/repo-store";
import { useTerminalStore, type TerminalTab } from "@/lib/terminal-store";
import { cn } from "@/lib/utils";

const EMPTY_TABS: TerminalTab[] = [];

export function AgentsRepoBlock({
  path,
  selected,
  installed,
  onSelect,
}: {
  path: string;
  selected: AgentsSelection | null;
  installed: Set<string> | null;
  onSelect: (s: AgentsSelection) => void;
}) {
  const tabs = useTerminalStore((s) => s.tabsByPath[path] ?? EMPTY_TABS);
  const closeTab = useTerminalStore((s) => s.closeTab);
  const status = useRepoStore((s) => s.status[path] ?? AGENTS_EMPTY_STATUS);
  const branch = useRepoStore((s) => s.repos[path]?.branch);
  const sessions = agentTabs(tabs);
  const { add, del } = agentsDiffTotals(status);
  const repoSelected = selected?.path === path && !selected?.tabId;
  const layoutGroup = `agents-repo-${path}`;

  return (
    <div className="space-y-1">
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect({ path })}
        onKeyDown={(e) => e.key === "Enter" && onSelect({ path })}
        className={cn(
          "group flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 transition-colors",
          repoSelected
            ? "bg-sidebar-accent/70 text-foreground"
            : "hover:bg-sidebar-accent/40",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium tracking-tight">
            {agentsRepoName(path)}
          </div>
          {branch && (
            <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
              <GitBranch className="size-2.5 shrink-0 opacity-70" />
              <span className="truncate">{branch}</span>
            </div>
          )}
        </div>
        <AgentsDiffStat add={add} del={del} />
        <AgentsLaunchMenu
          path={path}
          installed={installed}
          onLaunched={(tabId) => onSelect({ path, tabId })}
        />
      </div>

      {sessions.length > 0 && (
        <LayoutGroup id={layoutGroup}>
          <div className="ml-1 space-y-0.5 border-l border-border/50 pl-2">
            {sessions.map((tab) => (
              <AgentsSessionRow
                key={tab.id}
                path={path}
                tab={tab}
                active={selected?.path === path && selected?.tabId === tab.id}
                layoutGroup={layoutGroup}
                onSelect={() => onSelect({ path, tabId: tab.id })}
                onClose={() => closeTab(path, tab.id)}
              />
            ))}
          </div>
        </LayoutGroup>
      )}
    </div>
  );
}
