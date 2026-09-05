import { useTranslation } from "react-i18next";

import { AnimatedNumber } from "@/components/motion/animated-number";
import type { AgentOverviewCounts } from "@/lib/agents/overview";
import { formatUsd } from "@/lib/agents/token-cost";

export function AgentFleetPulse({
  counts,
  total,
  costUsd,
}: {
  counts: AgentOverviewCounts;
  total: number;
  costUsd: number;
}) {
  const { t } = useTranslation();
  const needsYou = counts.awaitingApproval + counts.failed;

  return (
    <ul className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1 text-[12px] font-medium tabular-nums">
      <li className="flex items-center gap-1.5 text-[var(--git-branch)]">
        <span
          aria-hidden
          className="size-1.5 rounded-full bg-[var(--git-branch)]"
        />
        <AnimatedNumber value={needsYou} />
        <span className="font-medium text-[var(--ag-text-2)]">
          {t("agentWorkspace.needsYou")}
        </span>
      </li>
      <li className="flex items-center gap-1.5 text-[var(--git-modified)]">
        <span
          aria-hidden
          className="size-1.5 rounded-full bg-[var(--git-modified)]"
        />
        <AnimatedNumber value={counts.running} />
        <span className="font-medium text-[var(--ag-text-2)]">
          {t("agentWorkspace.working")}
        </span>
      </li>
      <li className="flex items-center gap-1.5 text-[var(--ag-text-3)]">
        <AnimatedNumber value={total} />
        <span>{t("agentWorkspace.sessions")}</span>
      </li>
      {costUsd > 0 ? (
        <li className="text-[var(--ag-text-3)]">{formatUsd(costUsd)}</li>
      ) : null}
    </ul>
  );
}
