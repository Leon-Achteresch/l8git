import { m } from "motion/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { AgentReviewStepStatusIcon } from "@/components/agents/worktree-review/agent-review-step-status-icon";
import type { AgentReviewStep } from "@/lib/agents/agent-review";
import { SPRING_PANEL } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";

export function AgentReviewStepCard({
  step,
  title,
  children,
}: {
  step: AgentReviewStep;
  title: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <m.section
      className={cn(
        "rounded-[var(--ag-r-md)] border border-[var(--ag-line)] bg-[var(--ag-surface)] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.08)] transition-[transform,border-color,box-shadow] duration-200 hover:border-[var(--ag-line-strong)] space-y-2 rounded-lg p-3",
        step.status === "failed" && "ring-1 ring-destructive/40",
        step.status === "done" && "opacity-70",
      )}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_PANEL}
    >
      <header className="flex items-center gap-2">
        <AgentReviewStepStatusIcon step={step} />
        <span className="flex-1 text-xs font-medium">{title}</span>
        <span className="text-[var(--ag-text-3)] text-[10.5px] uppercase tracking-wide">
          {t(`agentReview.status.${step.status}`)}
        </span>
      </header>
      {children}
      {step.error ? (
        <p className="rounded-md bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
          {step.error}
        </p>
      ) : null}
    </m.section>
  );
}
