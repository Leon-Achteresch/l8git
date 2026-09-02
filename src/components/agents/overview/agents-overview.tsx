import {
  Activity,
  ArrowLeft,
  Coins,
  LayoutGrid,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { m } from "motion/react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { AgentOverviewRow } from "@/components/agents/overview/agent-overview-row";
import { AgentSectionTabs } from "@/components/agents/ui/agent-section-tabs";
import { AgentStatusChip } from "@/components/agents/ui/agent-status-chip";
import { AgentsEnter } from "@/components/agents/ui/agents-enter";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { SharedLayoutBg } from "@/components/motion/shared-layout-bg";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  filterOverviewEntries,
  type AgentOverviewEntry,
} from "@/lib/agents/overview";
import { formatUsd } from "@/lib/agents/token-cost";
import {
  useAgentOverviewCounts,
  useAgentOverviewEntries,
} from "@/lib/agents/use-agent-overview";
import { useWorktreeDiffStore } from "@/lib/agents/worktree-diff";
import { SPRING_PRESS } from "@/lib/motion/ease";

const VISIBLE_LIMIT = 200;

function useRelativeDate(locale: string) {
  return useMemo(() => {
    const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    const dateFormatter = new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "short",
    });
    return (timestamp: number) => {
      const seconds = Math.round(Date.now() / 1000 - timestamp);
      if (seconds < 60) return formatter.format(0, "second");
      if (seconds < 3600)
        return formatter.format(-Math.round(seconds / 60), "minute");
      if (seconds < 86400)
        return formatter.format(-Math.round(seconds / 3600), "hour");
      if (seconds < 604800)
        return formatter.format(-Math.round(seconds / 86400), "day");
      return dateFormatter.format(timestamp * 1000);
    };
  }, [locale]);
}

type OverviewFilter = "all" | "running" | "waiting" | "worktrees";

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
  const [filter, setFilter] = useState<OverviewFilter>("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const relativeDate = useRelativeDate(i18n.language);
  const statsByPath = useWorktreeDiffStore((state) => state.statsByPath);
  const refreshDiffStats = useWorktreeDiffStore((state) => state.refresh);

  const filteredByTab = useMemo(() => {
    if (filter === "running") {
      return entries.filter((e) => e.status === "running");
    }
    if (filter === "waiting") {
      return entries.filter((e) => e.status === "awaitingApproval");
    }
    if (filter === "worktrees") {
      return entries.filter((e) => e.isWorktree);
    }
    return entries;
  }, [entries, filter]);

  const visible = useMemo(
    () =>
      filterOverviewEntries(filteredByTab, deferredQuery).slice(0, VISIBLE_LIMIT),
    [deferredQuery, filteredByTab],
  );

  const totalCost = useMemo(
    () => entries.reduce((sum, entry) => sum + (entry.costUsd ?? 0), 0),
    [entries],
  );

  const worktreePaths = useMemo(
    () => [
      ...new Set(
        visible.filter((entry) => entry.isWorktree).map((entry) => entry.path),
      ),
    ],
    [visible],
  );
  const worktreeKey = worktreePaths.join("|");

  useEffect(() => {
    if (!worktreePaths.length) return;
    void refreshDiffStats(worktreePaths).catch(() => {});
  }, [refreshDiffStats, worktreeKey, worktreePaths]);

  const filterTabs = [
    { id: "all" as const, label: `${t("agentChat.recents")} (${entries.length})` },
    {
      id: "running" as const,
      label: `${t("agentChat.working")} (${counts.running})`,
    },
    {
      id: "waiting" as const,
      label: `${t("agentChat.permissionPending")} (${counts.awaitingApproval})`,
    },
    {
      id: "worktrees" as const,
      label: `${t("agentChat.worktrees")} (${entries.filter((e) => e.isWorktree).length})`,
    },
  ];

  return (
    <section className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[var(--ag-canvas)]">
      <header className="ag-line flex h-14 shrink-0 items-center justify-between gap-4 border-b bg-[var(--ag-surface)] px-6">
        <div className="flex items-center gap-3">
          <m.button
            type="button"
            onClick={onClose}
            whileTap={{ scale: 0.96 }}
            transition={SPRING_PRESS}
            className="ag-icon-btn size-8 rounded-[var(--ag-r-md)] border border-[var(--ag-line)] bg-[var(--ag-surface-2)] shadow-[var(--ag-shadow-raise)] hover:border-[var(--ag-line-strong)]"
            title={t("agentOverview.backToChat")}
            aria-label={t("agentOverview.backToChat")}
          >
            <ArrowLeft className="size-4" />
          </m.button>
          <span className="grid size-8 place-items-center rounded-[var(--ag-r-md)] bg-[var(--ag-surface-2)] text-[var(--git-branch)]">
            <LayoutGrid className="size-4" />
          </span>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-[var(--ag-text)]">
              {t("agentOverview.title")}
            </h1>
            <p className="text-[11px] font-medium text-[var(--ag-text-3)]">
              {t("agentOverview.summary", {
                total: entries.length,
                running: counts.running,
                waiting: counts.awaitingApproval,
              })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {counts.running > 0 ? (
            <AgentStatusChip tone="working" className="h-7 px-2.5">
              <Activity className="size-3 shrink-0" />
              <span>
                <AnimatedNumber value={counts.running} /> aktiv
              </span>
            </AgentStatusChip>
          ) : null}

          {totalCost > 0 ? (
            <div className="flex h-7 items-center gap-1.5 rounded-full border border-[var(--ag-line)] bg-[var(--ag-surface-2)] px-2.5 text-[11px] font-medium tabular-nums text-[var(--ag-text-2)]">
              <Coins className="size-3 text-[var(--ag-text-3)]" />
              {formatUsd(totalCost)}
            </div>
          ) : null}

          <m.button
            type="button"
            onClick={onRefresh}
            whileTap={{ scale: 0.95 }}
            transition={SPRING_PRESS}
            className="ag-icon-btn size-8 rounded-[var(--ag-r-md)] border border-[var(--ag-line)] bg-[var(--ag-surface-2)] hover:border-[var(--ag-line-strong)]"
            aria-label={t("agentOverview.refresh")}
            title={t("agentOverview.refresh")}
          >
            <RefreshCw className="size-3.5" />
          </m.button>
        </div>
      </header>

      <div className="ag-line flex flex-wrap items-center justify-between gap-3 border-b bg-[var(--ag-surface-2)]/40 px-6 py-3">
        <AgentSectionTabs
          items={filterTabs}
          value={filter}
          onChange={(id) => setFilter(id as OverviewFilter)}
          label={t("agentOverview.filterLabel", "Filter")}
          layoutId="overview-filter-tab"
        />

        <div className="ag-inset flex h-8 w-64 items-center gap-2 rounded-[var(--ag-r-md)] border border-transparent bg-[var(--ag-surface)] px-2.5 text-[12px] shadow-[var(--ag-shadow-raise)] focus-within:border-[var(--ag-line-strong)]">
          <Search className="size-3.5 shrink-0 text-[var(--ag-text-3)]" />
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
              className="ag-icon-btn size-5 text-[var(--ag-text-3)] hover:text-[var(--ag-text)]"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>
      </div>

      <ScrollArea className="ag-scroll min-h-0 flex-1 px-6 py-4">
        <div className="mx-auto max-w-6xl space-y-1.5">
          {visible.length === 0 ? (
            <AgentsEnter className="flex flex-col items-center justify-center py-16 text-center">
              <span className="mb-3 grid size-12 place-items-center rounded-2xl border border-[var(--ag-line)] bg-[var(--ag-surface-2)] shadow-[var(--ag-shadow-raise)]">
                <Sparkles className="size-5 text-[var(--ag-text-3)]" />
              </span>
              <p className="text-sm font-semibold text-[var(--ag-text)]">
                {query ? t("agentOverview.noMatches") : t("agentOverview.empty")}
              </p>
            </AgentsEnter>
          ) : (
            <SharedLayoutBg inset={4} pillClassName="rounded-[var(--ag-r-md)]">
              {visible.map((entry) => (
                <AgentOverviewRow
                  key={entry.key}
                  entry={entry}
                  diffStat={
                    entry.isWorktree ? statsByPath[entry.path] : undefined
                  }
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
