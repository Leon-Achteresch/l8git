import { ClipboardList, LoaderCircle, PenLine, Play, Zap } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { AgentMarkdown } from "@/components/agents/ui/agent-markdown";
import { SpinIcon } from "@/components/motion/kit";
import { AGENT_PROSE_CLASS } from "@/components/agents/ui/streaming-response";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAgentChatStore } from "@/lib/agents/active-chat-store";
import type { AgentPendingRequest } from "@/lib/agents/types";
import { cn } from "@/lib/utils";

export type PlanDecision = "accept" | "acceptEdits" | "decline";

export function AgentPlanCard({ request }: { request: AgentPendingRequest }) {
  const { t } = useTranslation();
  const respond = useAgentChatStore((state) => state.respondToRequest);
  const [pending, setPending] = useState<PlanDecision | null>(null);
  const [resolved, setResolved] = useState<PlanDecision | null>(null);
  const [feedback, setFeedback] = useState("");
  const reduce = useReducedMotion() ?? false;
  const plan = request.plan?.trim() || request.reason?.trim() || "";

  const decide = async (decision: PlanDecision) => {
    setPending(decision);
    try {
      await respond(request, { decision, feedback: feedback.trim() });
      setResolved(decision);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(null);
    }
  };

  const busy = pending !== null;
  const status = resolved
    ? resolved === "decline"
      ? t("agentChat.plan.statusKeptPlanning")
      : t("agentChat.plan.statusApproved")
    : busy
      ? t("agentChat.request.statusSubmitting")
      : t("agentChat.plan.statusPending");

  return (
    <div className="rounded-[var(--ag-r-md)] border border-[var(--ag-line)] bg-[var(--ag-surface)] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.08)] transition-[transform,border-color,box-shadow] duration-200 hover:border-[var(--ag-line-strong)] overflow-hidden">
      <div className="flex items-center gap-2 border-b border-[var(--ag-line)] px-3 py-2">
        <ClipboardList className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-[13px] font-medium">{t("agentChat.plan.title")}</span>
        <span
          className={cn(
            "ml-auto rounded-full border px-2 py-0.5 text-[10px] font-medium",
            resolved === "decline"
              ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
              : resolved
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
          )}
        >
          {status}
        </span>
      </div>

      {plan ? (
        <div className={cn("[scrollbar-color:color-mix(in_oklab,var(--foreground)_16%,transparent)_transparent] [scrollbar-width:thin] max-h-[420px] overflow-auto px-3 py-3", AGENT_PROSE_CLASS)}>
          <AgentMarkdown>{plan}</AgentMarkdown>
        </div>
      ) : (
        <p className="text-[var(--ag-text-2)] px-3 py-3 text-[12px]">{t("agentChat.plan.empty")}</p>
      )}

      {resolved ? null : (
        <div className="space-y-2 border-t border-[var(--ag-line)] px-3 py-2.5">
          <Textarea
            value={feedback}
            disabled={busy}
            rows={2}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder={t("agentChat.plan.feedbackPlaceholder")}
            className="min-h-0 resize-none bg-background/70 text-[12px]"
          />
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" disabled={busy} onClick={() => void decide("accept")}>
              {pending === "accept" ? (
                <SpinIcon icon={LoaderCircle} active={!reduce} className="size-3.5" />
              ) : (
                <Play className="size-3.5" />
              )}
              {t("agentChat.plan.approve")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void decide("acceptEdits")}
            >
              {pending === "acceptEdits" ? (
                <SpinIcon icon={LoaderCircle} active={!reduce} className="size-3.5" />
              ) : (
                <Zap className="size-3.5" />
              )}
              {t("agentChat.plan.approveAuto")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void decide("decline")}
            >
              {pending === "decline" ? (
                <SpinIcon icon={LoaderCircle} active={!reduce} className="size-3.5" />
              ) : (
                <PenLine className="size-3.5" />
              )}
              {t("agentChat.plan.keepPlanning")}
            </Button>
          </div>
          <p className="text-[var(--ag-text-3)] text-[10px] leading-4">{t("agentChat.plan.hint")}</p>
        </div>
      )}
    </div>
  );
}
