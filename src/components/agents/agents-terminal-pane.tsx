import { SquareTerminal } from "lucide-react";
import { m } from "motion/react";
import { useTranslation } from "react-i18next";

import { AgentsLaunchGrid } from "@/components/agents/agents-launch-grid";
import {
  agentsRepoName,
  type AgentsSelection,
} from "@/components/agents/agents-types";
import { RepoTerminalSession } from "@/components/repo/remote/repo-terminal-session";
import { integrationOf } from "@/lib/agent-integrations";
import { useTerminalActivity } from "@/lib/terminal/activity";
import { terminalLeafId } from "@/lib/terminal/leaf-id";
import { useTerminalStore } from "@/lib/terminal-store";

export function AgentsTerminalPane({
  selected,
  isDark,
  onSelect,
}: {
  selected: AgentsSelection | null;
  isDark: boolean;
  onSelect: (s: AgentsSelection) => void;
}) {
  const { t } = useTranslation();
  const tab = useTerminalStore((s) =>
    selected?.tabId
      ? s.tabsByPath[selected.path]?.find((x) => x.id === selected.tabId)
      : undefined,
  );
  const working = useTerminalActivity((s) =>
    selected?.tabId
      ? !!s.busy[terminalLeafId(selected.path, selected.tabId)]
      : false,
  );

  if (!selected) {
    return (
      <section className="flex min-h-0 flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">{t("agents.noSession")}</p>
      </section>
    );
  }

  const integration = tab ? integrationOf(tab) : undefined;
  const Icon = integration?.icon ?? SquareTerminal;

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-11 shrink-0 items-center gap-2.5 border-b border-border/40 px-4">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted/60 ring-1 ring-border/40">
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium tracking-tight">
            {tab?.title ?? agentsRepoName(selected.path)}
          </div>
          <div className="truncate text-[10px] text-muted-foreground">
            {agentsRepoName(selected.path)}
          </div>
        </div>
        {working && (
          <m.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-git-branch/10 px-2.5 py-1 text-[11px] font-medium text-git-branch"
          >
            <span className="size-1.5 animate-pulse rounded-full bg-git-branch" />
            {t("agents.working")}
          </m.span>
        )}
      </header>
      {tab ? (
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <RepoTerminalSession
            key={terminalLeafId(selected.path, tab.id)}
            path={selected.path}
            tabId={tab.id}
            active
            isDark={isDark}
          />
        </div>
      ) : (
        <AgentsLaunchGrid
          path={selected.path}
          onLaunched={(tabId) => onSelect({ path: selected.path, tabId })}
        />
      )}
    </section>
  );
}
