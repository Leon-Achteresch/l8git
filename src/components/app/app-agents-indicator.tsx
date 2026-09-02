import { Link } from "@tanstack/react-router";
import { Bot } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AgentWorkingRing } from "@/components/agents/ui/agent-working-ring";
import { useActiveAgentCount, useAwaitingApprovalCount } from "@/lib/agents/use-agent-overview";
import { cn } from "@/lib/utils";

export function AppAgentsIndicator() {
  const { t } = useTranslation();
  const active = useActiveAgentCount();
  const waiting = useAwaitingApprovalCount();
  if (active === 0) return null;

  const label = waiting
    ? t("agentOverview.indicatorWaiting", { count: waiting })
    : t("agentOverview.indicatorRunning", { count: active });

  return (
    <Link
      to="/agents"
      search={{ view: "overview" as const }}
      title={label}
      aria-label={label}
      className={cn(
        "relative inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium tabular-nums transition-all duration-150",
        waiting
          ? "text-[var(--git-modified)] hover:bg-foreground/10"
          : "text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
      )}
    >
      <span className="relative inline-flex size-4 items-center justify-center">
        <Bot className="size-4 shrink-0" strokeWidth={2} />
        <span className="absolute -right-1 -top-1 text-[var(--git-modified)]" aria-hidden>
          <AgentWorkingRing size={10} thickness={1.3} />
        </span>
      </span>
      {active}
    </Link>
  );
}
