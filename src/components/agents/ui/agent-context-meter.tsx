import { useTranslation } from "react-i18next";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatTokens } from "@/lib/agents/token-cost";
import type { AgentTokenUsage } from "@/lib/agents/types";

const SIZE = 14;
const STROKE = 2;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function ringClass(ratio: number): string {
  if (ratio >= 0.9) return "text-red-400";
  if (ratio >= 0.75) return "text-amber-400";
  return "text-current opacity-60";
}

export function AgentContextMeter({ usage }: { usage: AgentTokenUsage | null }) {
  const { t } = useTranslation();
  const window = usage?.modelContextWindow ?? 0;
  if (!usage || window <= 0) return null;

  const used = Math.max(0, usage.totalTokens);
  const ratio = Math.min(1, used / window);
  const percent = Math.round(ratio * 100);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className={ringClass(ratio)}
            role="img"
            aria-label={t("agentChat.contextUsed", { value: percent })}
          >
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth={STROKE}
              className="opacity-25"
            />
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - ratio)}
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            />
          </svg>
          <span>{percent}%</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <div>{t("agentChat.contextUsed", { value: percent })}</div>
        <div className="ag-faint tabular-nums">
          {formatTokens(used)} / {formatTokens(window)}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
