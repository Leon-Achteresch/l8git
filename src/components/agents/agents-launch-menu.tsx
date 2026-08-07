import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AGENT_INTEGRATIONS,
  launchAgent,
  type AgentIntegration,
} from "@/lib/agent-integrations";

export function AgentsLaunchMenu({
  path,
  installed,
  onLaunched,
}: {
  path: string;
  installed: Set<string> | null;
  onLaunched: (tabId: string) => void;
}) {
  const { t } = useTranslation();
  const items = AGENT_INTEGRATIONS.filter(
    (i) => i.surface === "terminal" && (!installed || installed.has(i.id)),
  );

  const launch = (integration: AgentIntegration) => {
    const tabId = launchAgent(path, integration, { newInstance: true });
    onLaunched(tabId);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        onClick={(e) => e.stopPropagation()}
        aria-label={t("agents.launch")}
        title={t("agents.launch")}
        asChild
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-7 shrink-0 rounded-full text-muted-foreground opacity-50 transition-[opacity,background-color,transform] duration-200 hover:bg-foreground/10 hover:text-foreground hover:opacity-100 active:scale-90 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
        >
          <Plus className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="min-w-[200px] rounded-2xl p-1.5 shadow-lg"
      >
        {items.map((integration) => (
          <DropdownMenuItem
            key={integration.id}
            onClick={(e) => {
              e.stopPropagation();
              launch(integration);
            }}
            className="gap-2.5 rounded-xl px-2 py-1.5"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.05] ring-1 ring-border/30">
              <integration.icon className="size-3.5" />
            </span>
            <span className="text-[12px] font-medium tracking-tight">
              {integration.label}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
