import { GitBranch } from "lucide-react";
import { AnimatePresence, LayoutGroup, m } from "motion/react";

import { SPRING_LAYOUT, SPRING_PANEL } from "@/@lib/ease";
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
  const inRepo = selected?.path === path;
  const layoutGroup = `agents-repo-${path}`;
  const name = agentsRepoName(path);

  return (
    <div
      className={cn(
        "rounded-2xl transition-[background-color,box-shadow] duration-300",
        sessions.length > 0 &&
          "bg-foreground/[0.02] ring-1 ring-inset ring-border/30",
        inRepo && sessions.length > 0 && "bg-foreground/[0.035]",
      )}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect({ path })}
        onKeyDown={(e) => e.key === "Enter" && onSelect({ path })}
        className={cn(
          "group relative flex cursor-pointer items-center gap-2.5 rounded-2xl px-2 py-2 transition-colors duration-200",
          repoSelected
            ? "text-foreground"
            : "text-foreground/90 hover:bg-foreground/[0.04]",
        )}
      >
        {repoSelected && (
          <m.span
            layoutId="agents-active-repo"
            transition={SPRING_LAYOUT}
            className="absolute inset-0 -z-10 rounded-2xl bg-background shadow-sm ring-1 ring-border/60"
            aria-hidden
          />
        )}
        <span className="flex size-7 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-foreground/[0.16] to-foreground/[0.05] text-[11px] font-semibold uppercase text-foreground/70 ring-1 ring-border/30">
          {name.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium tracking-tight">
            {name}
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

      <AnimatePresence initial={false}>
        {sessions.length > 0 && (
          <m.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={SPRING_PANEL}
            className="overflow-hidden"
          >
            <LayoutGroup id={layoutGroup}>
              <div className="ml-4 space-y-0.5 border-l border-border/40 pb-1.5 pl-1.5 pr-1.5">
                {sessions.map((tab) => (
                  <AgentsSessionRow
                    key={tab.id}
                    path={path}
                    tab={tab}
                    active={
                      selected?.path === path && selected?.tabId === tab.id
                    }
                    layoutGroup={layoutGroup}
                    onSelect={() => onSelect({ path, tabId: tab.id })}
                    onClose={() => closeTab(path, tab.id)}
                  />
                ))}
              </div>
            </LayoutGroup>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
