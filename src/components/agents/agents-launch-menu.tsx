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
    (i) => !installed || installed.has(i.id),
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
          className="size-7 shrink-0 rounded-lg text-muted-foreground"
        >
          <Plus className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        {items.map((integration) => (
          <DropdownMenuItem
            key={integration.id}
            onClick={(e) => {
              e.stopPropagation();
              launch(integration);
            }}
            className="gap-2"
          >
            <integration.icon className="size-4" />
            {integration.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
