import { Bot } from "lucide-react";
import { m } from "motion/react";
import { useTranslation } from "react-i18next";

import { SPRING_PANEL } from "@/@lib/ease";
import { AgentsRepoBlock } from "@/components/agents/agents-repo-block";
import type { AgentsSelection } from "@/components/agents/agents-types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useInstalledAgents } from "@/lib/agent-integrations";

export function AgentsSidebar({
  paths,
  selected,
  onSelect,
}: {
  paths: string[];
  selected: AgentsSelection | null;
  onSelect: (s: AgentsSelection) => void;
}) {
  const { t } = useTranslation();
  const installed = useInstalledAgents((s) => s.installed);

  return (
    <aside className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2.5 px-3.5">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.06] ring-1 ring-border/40">
          <Bot className="size-3.5 text-muted-foreground" />
        </span>
        <span className="text-[13px] font-medium tracking-tight">
          {t("agents.repos")}
        </span>
        <span className="ml-auto rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground ring-1 ring-border/30">
          {paths.length}
        </span>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1.5 p-2.5 pt-0.5">
          {paths.map((path, i) => (
            <m.div
              key={path}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING_PANEL, delay: Math.min(i, 8) * 0.035 }}
            >
              <AgentsRepoBlock
                path={path}
                selected={selected}
                installed={installed}
                onSelect={onSelect}
              />
            </m.div>
          ))}
        </div>
      </ScrollArea>
    </aside>
  );
}
