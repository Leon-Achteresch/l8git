import { Compass } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AgentsEnter } from "@/components/agents/ui/agents-enter";
import { Button } from "@/components/ui/button";
import { useAgentChatStore } from "@/lib/agents/active-chat-store";

export function AgentPlanBanner() {
  const { t } = useTranslation();
  const collaborationMode = useAgentChatStore((state) => state.collaborationMode);
  const setCollaborationMode = useAgentChatStore((state) => state.setCollaborationMode);

  if (collaborationMode !== "plan") return null;

  return (
    <AgentsEnter>
    <div className="rounded-[var(--ag-r-md)] border border-[var(--ag-line)] bg-[var(--ag-surface)] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.08)] transition-[transform,border-color,box-shadow] duration-200 hover:border-[var(--ag-line-strong)] mt-2 flex w-full items-start gap-2.5 border-blue-500/30 bg-blue-500/[0.07] px-3 py-2.5 text-[12px]">
      <Compass className="mt-0.5 size-4 shrink-0 text-blue-600 dark:text-blue-400" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{t("agentChat.plan.bannerTitle")}</p>
        <p className="text-[var(--ag-text-2)] mt-0.5">{t("agentChat.plan.bannerBody")}</p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="shrink-0 self-center"
        onClick={() => setCollaborationMode("default")}
      >
        {t("agentChat.plan.bannerAction")}
      </Button>
    </div>
    </AgentsEnter>
  );
}
