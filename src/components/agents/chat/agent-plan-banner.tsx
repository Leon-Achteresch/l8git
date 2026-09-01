import { Compass } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AgentsEnter } from "@/components/agents/ui/agents-enter";
import { Button } from "@/components/ui/button";
import { useAgentChatStore } from "@/lib/agents/active-chat-store";

/**
 * Plan mode keeps the agent read-only, which is easy to forget once a chat is
 * scrolled. The banner keeps that state visible and one click away from ending.
 */
export function AgentPlanBanner() {
  const { t } = useTranslation();
  const collaborationMode = useAgentChatStore((state) => state.collaborationMode);
  const setCollaborationMode = useAgentChatStore((state) => state.setCollaborationMode);

  if (collaborationMode !== "plan") return null;

  return (
    <AgentsEnter>
    <div className="ag-card mx-auto mt-2 flex w-full max-w-3xl items-start gap-2.5 border-blue-500/30 bg-blue-500/[0.07] px-3 py-2.5 text-[12px]">
      <Compass className="mt-0.5 size-4 shrink-0 text-blue-600 dark:text-blue-400" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{t("agentChat.plan.bannerTitle")}</p>
        <p className="ag-muted mt-0.5">{t("agentChat.plan.bannerBody")}</p>
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
