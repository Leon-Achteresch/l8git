import { Bot } from "lucide-react";
import { useTranslation } from "react-i18next";

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
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border/40 px-3.5">
        <Bot className="size-4 text-muted-foreground" />
        <span className="text-[13px] font-medium tracking-tight">
          {t("agents.repos")}
        </span>
        <span className="ml-auto rounded-md bg-muted/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
          {paths.length}
        </span>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-2.5">
          {paths.map((path) => (
            <AgentsRepoBlock
              key={path}
              path={path}
              selected={selected}
              installed={installed}
              onSelect={onSelect}
            />
          ))}
        </div>
      </ScrollArea>
    </aside>
  );
}
