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
  disabled = false,
}: {
  step: AgentReviewStep;
  steps: readonly AgentReviewStep[];
  label: string;
  onRun: () => void;
  onRetry: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  if (step.status === "failed") {
    return (
      <Button
        type="button"
        size="sm"
        variant="destructive"
        onClick={onRetry}
        disabled={disabled}
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
      disabled={disabled || !canRunStep(steps, step.id)}
      onClick={onRun}
      className="h-7 text-xs"
    >
      {label}
    </Button>
  );
}
