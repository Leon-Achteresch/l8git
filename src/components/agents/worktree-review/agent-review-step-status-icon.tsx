import {
  Check,
  CircleDashed,
  GitMerge,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";

import { spinTransition } from "@/components/motion/kit";
import { SPRING_SWAP } from "@/lib/motion/ease";
import type { AgentReviewStep, AgentReviewStepId } from "@/lib/agents/agent-review";

const STEP_ICONS: Record<AgentReviewStepId, typeof Check> = {
  commit: Check,
  merge: GitMerge,
  cleanup: CircleDashed,
};

export function AgentReviewStepStatusIcon({ step }: { step: AgentReviewStep }) {
  const reduce = useReducedMotion();
  const Icon = STEP_ICONS[step.id];

  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.span
        key={step.status}
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
        transition={SPRING_SWAP}
        className="inline-flex"
      >
        {step.status === "running" ? (
          <m.span
            className="inline-flex"
            animate={reduce ? undefined : { rotate: 360 }}
            transition={reduce ? undefined : spinTransition}
          >
            <Loader2 className="size-3.5 text-primary" />
          </m.span>
        ) : step.status === "failed" ? (
          <TriangleAlert className="size-3.5 text-destructive" />
        ) : step.status === "done" ? (
          <Check className="size-3.5 text-git-added" />
        ) : (
          <Icon className="size-3.5 text-muted-foreground" />
        )}
      </m.span>
    </AnimatePresence>
  );
}
