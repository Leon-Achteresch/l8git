import { LayoutGrid, RefreshCw, Search, X } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { AgentOverviewRow } from "@/components/agents/overview/agent-overview-row";
import { AgentsEnter } from "@/components/agents/ui/agents-enter";
import { AgentStatusChip } from "@/components/agents/ui/agent-status-chip";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { SharedLayoutBg } from "@/components/motion/shared-layout-bg";
import { ScrollArea } from "@/components/ui/scroll-area";
import { filterOverviewEntries, type AgentOverviewEntry } from "@/lib/agents/overview";
import { formatUsd } from "@/lib/agents/token-cost";
import { useAgentOverviewCounts, useAgentOverviewEntries } from "@/lib/agents/use-agent-overview";
import { useWorktreeDiffStore } from "@/lib/agents/worktree-diff";

const VISIBLE_LIMIT = 200;

function useRelativeDate(locale: string) {
  return useMemo(() => {
    const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    const dateFormatter = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" });
    return (timestamp: number) => {
      const seconds = Math.round(Date.now() / 1000 - timestamp);
      if (seconds < 60) return formatter.format(0, "second");
      if (seconds < 3600) return formatter.format(-Math.round(seconds / 60), "minute");
      if (seconds < 86400) return formatter.format(-Math.round(seconds / 3600), "hour");
      if (seconds < 604800) return formatter.format(-Math.round(seconds / 86400), "day");
      return dateFormatter.format(timestamp * 1000);
    };
  }, [locale]);
}

export function AgentsOverview({
  onOpenThread,
  onClose,
  onRefresh,
}: {
  onOpenThread: (entry: AgentOverviewEntry) => void;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const { t, i18n } = useTranslation();
  const entries = useAgentOverviewEntries();
  const counts = useAgentOverviewCounts(entries);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const relativeDate = useRelativeDate(i18n.language);
  const statsByPath = useWorktreeDiffStore((state) => state.statsByPath);
  const refreshDiffStats = useWorktreeDiffStore((state) => state.refresh);

  const visible = useMemo(
    () => filterOverviewEntries(entries, deferredQuery).slice(0, VISIBLE_LIMIT),
    [deferredQuery, entries],
  );
  const totalCost = useMemo(
    () => entries.reduce((sum, entry) => sum + (entry.costUsd ?? 0), 0),
    [entries],
  );
  const worktreePaths = useMemo(
    () => [...new Set(visible.filter((entry) => entry.isWorktree).map((entry) => entry.path))],
    [visible],
  );
  const worktreeKey = worktreePaths.join("|");

  useEffect(() => {
    if (!worktreePaths.length) return;
    void refreshDiffStats(worktreePaths).catch(() => {});
  }, [refreshDiffStats, worktreeKey, worktreePaths]);

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="ag-line flex h-12 shrink-0 items-center gap-2 border-b px-3.5">
        <LayoutGrid className="ag-faint size-3.5 shrink-0" />
        <h2 className="min-w-0 truncate text-[13px] font-semibold tracking-[-0.01em] text-[var(--ag-text)]">
          {t("agentOverview.title")}
        </h2>
        <span className="ag-faint truncate text-[11px] tabular-nums">
          {t("agentOverview.summary", {
            total: entries.length,
            running: counts.running,
            waiting: counts.awaitingApproval,
          })}
        </span>
        <div className="flex-1" />
        {counts.running > 0 ? (
          <AgentStatusChip tone="working" className="shrink-0">
            <AnimatedNumber value={counts.running} />
          </AgentStatusChip>
        ) : null}
        {totalCost > 0 ? (
          <span className="ag-faint shrink-0 text-[11px] tabular-nums">
            {t("agentOverview.totalCost", { cost: formatUsd(totalCost) })}
          </span>
        ) : null}
        <button
          type="button"
          onClick={onRefresh}
          className="ag-icon-btn size-6"
          aria-label={t("agentOverview.refresh")}
          title={t("agentOverview.refresh")}
        >
          <RefreshCw className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="ag-chip h-6 px-2 text-[11px]"
          title={t("agentOverview.backToChat")}
        >
          {t("agentOverview.backToChat")}
        </button>
      </header>

      <div className="ag-line border-b px-3 py-2">
        <div className="ag-inset ag-row h-8 cursor-text rounded-full text-[12px] focus-within:bg-[var(--ag-surface)]">
          <Search className="size-3.5 shrink-0" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("agentOverview.searchPlaceholder")}
            aria-label={t("agentOverview.searchPlaceholder")}
            className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--ag-text)] outline-none placeholder:text-[var(--ag-text-3)]"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("agentChat.clearSearch")}
              className="ag-icon-btn size-5"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>
      </div>

      <ScrollArea className="ag-scroll min-h-0 flex-1">
        <div className="space-y-0.5 p-2">
          {visible.length === 0 ? (
            <AgentsEnter>
              <p className="ag-faint px-2 py-8 text-center text-[12px]">
                {query ? t("agentOverview.noMatches") : t("agentOverview.empty")}
              </p>
            </AgentsEnter>
          ) : (
            <SharedLayoutBg inset={4}>
              {visible.map((entry) => (
                <AgentOverviewRow
                  key={entry.key}
                  entry={entry}
                  diffStat={entry.isWorktree ? statsByPath[entry.path] : undefined}
                  relativeDate={relativeDate(entry.updatedAt)}
                  onOpen={onOpenThread}
                />
              ))}
            </SharedLayoutBg>
          )}
        </div>
      </ScrollArea>
    </section>
  );
}
