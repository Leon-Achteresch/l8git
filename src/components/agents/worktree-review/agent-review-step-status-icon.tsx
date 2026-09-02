import {
  Check,
  CircleDashed,
  GitMerge,
  Loader2,
  TriangleAlert,
} from "lucide-react";

import { SpinIcon } from "@/components/motion/kit";
import type { AgentReviewStep, AgentReviewStepId } from "@/lib/agents/agent-review";

const STEP_ICONS: Record<AgentReviewStepId, typeof Check> = {
  commit: Check,
  merge: GitMerge,
  cleanup: CircleDashed,
};

export function AgentReviewStepStatusIcon({ step }: { step: AgentReviewStep }) {
  if (step.status === "running")
    return <SpinIcon icon={Loader2} className="size-3.5 text-primary" />;
  if (step.status === "failed")
    return <TriangleAlert className="size-3.5 text-destructive" />;
  if (step.status === "done")
    return <Check className="size-3.5 text-git-added" />;
  const Icon = STEP_ICONS[step.id];
  return <Icon className="size-3.5 text-muted-foreground" />;
}
