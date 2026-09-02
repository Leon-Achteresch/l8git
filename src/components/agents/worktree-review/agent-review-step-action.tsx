import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  canRunStep,
  type AgentReviewStep,
} from "@/lib/agents/agent-review";

export function AgentReviewStepAction({
  step,
  steps,
  label,
  onRun,
  onRetry,
}: {
  step: AgentReviewStep;
  steps: readonly AgentReviewStep[];
  label: string;
  onRun: () => void;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  if (step.status === "failed") {
    return (
      <Button
        type="button"
        size="sm"
        variant="destructive"
        onClick={onRetry}
        className="h-7 text-xs"
      >
        <RefreshCw className="mr-1.5 size-3" />
        {t("agentReview.retry")}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      disabled={!canRunStep(steps, step.id)}
      onClick={onRun}
      className="h-7 text-xs"
    >
      {label}
    </Button>
  );
}
