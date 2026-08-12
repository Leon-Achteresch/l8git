import { useMemo } from "react";
import { useTranslation } from "react-i18next";

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
    <div
      className="ag-line flex h-8 shrink-0 items-center border-t px-3.5 text-[11px]"
      title={t("agentChat.usageWeek", {
        cost: formatUsd(week.costUsd),
        tokens: formatTokens(weekTokens),
      })}
    >
      <span className="ag-faint truncate">
        {t("agentChat.usageToday", {
          cost: formatUsd(today.costUsd),
          tokens: formatTokens(todayTokens),
        })}
      </span>
    </div>
  );
}
