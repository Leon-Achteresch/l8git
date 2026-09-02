import { Coins } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { AgentsEnter } from "@/components/agents/ui/agents-enter";
import { formatTokens, formatUsd } from "@/lib/agents/token-cost";
import {
  dayKey,
  lastDayKeys,
  sumDays,
  useUsageLedgerStore,
} from "@/lib/agents/usage-ledger";

export function AgentUsageSummary() {
  const { t } = useTranslation();
  const days = useUsageLedgerStore((state) => state.days);
  const today = useMemo(() => sumDays(days, [dayKey()]), [days]);
  const week = useMemo(() => sumDays(days, lastDayKeys(7)), [days]);
  const todayTokens = today.inputTokens + today.outputTokens;
  const weekTokens = week.inputTokens + week.outputTokens;

  if (!todayTokens && !weekTokens) return null;

  return (
    <AgentsEnter>
      <div
        className="ag-line flex h-8.5 min-w-0 shrink-0 items-center gap-2 overflow-hidden border-t bg-[var(--ag-surface-2)]/40 px-3 text-[11px]"
        title={t("agentChat.usageWeek", {
          cost: formatUsd(week.costUsd),
          tokens: formatTokens(weekTokens),
        })}
      >
        <Coins className="size-3 shrink-0 text-[var(--ag-text-3)]" />
        <span className="ag-faint truncate font-medium">
          {t("agentChat.usageToday", {
            cost: formatUsd(today.costUsd),
            tokens: formatTokens(todayTokens),
          })}
        </span>
      </div>
    </AgentsEnter>
  );
}
