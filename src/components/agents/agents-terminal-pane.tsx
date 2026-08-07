import { SquareTerminal } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useTranslation } from "react-i18next";

import { SPRING_PANEL } from "@/lib/motion/ease";
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
      <header className="flex h-12 shrink-0 items-center gap-2.5 border-b border-border/40 px-3.5">
        <m.span
          key={tab?.id ?? selected.path}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={SPRING_PANEL}
          className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-foreground/[0.12] to-foreground/[0.04] ring-1 ring-border/40"
        >
          <Icon className="size-4" />
        </m.span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium tracking-tight">
            {tab?.title ?? agentsRepoName(selected.path)}
          </div>
          <div className="truncate text-[10px] text-muted-foreground">
            {agentsRepoName(selected.path)}
          </div>
        </div>
        <AnimatePresence>
          {working && (
            <m.span
              initial={{ opacity: 0, scale: 0.9, y: -2 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -2 }}
              transition={SPRING_PANEL}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-git-branch/10 py-1 pl-2 pr-2.5 text-[11px] font-medium text-git-branch ring-1 ring-git-branch/20"
            >
              <span className="relative flex size-1.5">
                <m.span
                  className="absolute inset-0 rounded-full bg-git-branch/60"
                  animate={{ scale: [1, 2.6], opacity: [0.6, 0] }}
                  transition={{
                    repeat: Infinity,
                    duration: 1.6,
                    ease: "easeOut",
                  }}
                  aria-hidden
                />
                <span className="relative size-1.5 rounded-full bg-git-branch" />
              </span>
              {t("agents.working")}
            </m.span>
          )}
        </AnimatePresence>
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
