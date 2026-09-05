import { AlertCircle, ChevronDown, LoaderCircle, MessagesSquare, Plus, RefreshCw, Search, X } from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { AgentCommandLane } from "@/components/agents/command/agent-command-lane";
import { AgentFleetPulse } from "@/components/agents/command/agent-fleet-pulse";
import { AgentFleetRepoGroup } from "@/components/agents/command/agent-fleet-repo-group";
import { AgentOverviewRow } from "@/components/agents/overview/agent-overview-row";
import { AgentSectionTabs } from "@/components/agents/ui/agent-section-tabs";
import { AgentsEnter } from "@/components/agents/ui/agents-enter";
import { SharedLayoutBg } from "@/components/motion/shared-layout-bg";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  filterOverviewEntries,
  groupEntriesByRepo,
  groupFleetLanes,
  type AgentOverviewEntry,
} from "@/lib/agents/overview";
import {
  useAgentOverviewCounts,
  useAgentOverviewEntries,
  useAgentOverviewLoading,
} from "@/lib/agents/use-agent-overview";
import { AGENT_PROVIDERS } from "@/lib/agents/provider-meta";
import { useWorktreeDiffStore } from "@/lib/agents/worktree-diff";
import { SPRING_PRESS } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 60;
const READY_GROUP_THRESHOLD = 8;

function useRelativeDate(locale: string) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return useMemo(() => {
    const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    const dateFormatter = new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "short",
    });
    return (timestamp: number) => {
      const seconds = Math.round(now / 1000 - timestamp);
      if (seconds < 60) return formatter.format(0, "second");
      if (seconds < 3600)
        return formatter.format(-Math.round(seconds / 60), "minute");
      if (seconds < 86400)
        return formatter.format(-Math.round(seconds / 3600), "hour");
      if (seconds < 604800)
        return formatter.format(-Math.round(seconds / 86400), "day");
      return dateFormatter.format(timestamp * 1000);
    };
  }, [locale, now]);
}

type OverviewFilter = "all" | "needsYou" | "working" | "ready" | "worktrees";

export function AgentsOverview({
  onOpenThread,
  onRefresh,
  onNewSession,
}: {
  onOpenThread: (entry: AgentOverviewEntry) => void;
  onRefresh: () => void | Promise<void>;
  onNewSession?: () => void | Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const reduce = useReducedMotion();
  const entries = useAgentOverviewEntries();
  const loading = useAgentOverviewLoading();
  const [providerFilter, setProviderFilter] = useState("all");
  const providerEntries = useMemo(() => providerFilter === "all" ? entries : entries.filter((entry) => entry.provider === providerFilter), [entries, providerFilter]);
  const counts = useAgentOverviewCounts(providerEntries);
  const [filter, setFilter] = useState<OverviewFilter>("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const searchRef = useRef<HTMLInputElement>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const refreshRef = useRef(false);
  const createRef = useRef(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const paginationKey = JSON.stringify([filter, providerFilter, deferredQuery.trim()]);
  const [pagination, setPagination] = useState({ key: paginationKey, limit: PAGE_SIZE });
  if (pagination.key !== paginationKey) {
    setPagination({ key: paginationKey, limit: PAGE_SIZE });
  }
  const limit = pagination.key === paginationKey ? pagination.limit : PAGE_SIZE;
  const hasFilters = filter !== "all" || providerFilter !== "all" || Boolean(query.trim());
  const relativeDate = useRelativeDate(i18n.language);
  const statsByPath = useWorktreeDiffStore((state) => state.statsByPath);
  const refreshDiffStats = useWorktreeDiffStore((state) => state.refresh);

  const filteredByTab = useMemo(() => {
    if (filter === "needsYou") {
      return providerEntries.filter(
        (entry) => entry.status === "awaitingApproval" || entry.status === "failed",
      );
    }
    if (filter === "working") {
      return providerEntries.filter((entry) => entry.status === "running");
    }
    if (filter === "ready") {
      return providerEntries.filter((entry) => entry.status === "idle");
    }
    if (filter === "worktrees") {
      return providerEntries.filter((entry) => entry.isWorktree);
    }
    return providerEntries;
  }, [providerEntries, filter]);

  const matches = useMemo(
    () => filterOverviewEntries(filteredByTab, deferredQuery),
    [deferredQuery, filteredByTab],
  );
  const visible = useMemo(() => matches.slice(0, limit), [matches, limit]);

  const lanes = useMemo(() => groupFleetLanes(visible), [visible]);
  const readyGroups = useMemo(
    () => groupEntriesByRepo(lanes.ready),
    [lanes.ready],
  );
  const groupReady = !hasFilters && readyGroups.length > 1 && lanes.ready.length > READY_GROUP_THRESHOLD;

  const totalCost = useMemo(
    () => providerEntries.reduce((sum, entry) => sum + (entry.costUsd ?? 0), 0),
    [providerEntries],
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

  const resetFilters = () => {
    setFilter("all");
    setProviderFilter("all");
    setQuery("");
    searchRef.current?.focus();
  };

  const refresh = async () => {
    if (refreshRef.current) return;
    refreshRef.current = true;
    setRefreshing(true);
    setActionError(null);
    try {
      await onRefresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      refreshRef.current = false;
      setRefreshing(false);
    }
  };

  const newSession = async () => {
    if (!onNewSession || createRef.current) return;
    createRef.current = true;
    setCreating(true);
    setActionError(null);
    try {
      await onNewSession();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      createRef.current = false;
      setCreating(false);
    }
  };

  const renderRows = (items: AgentOverviewEntry[]) => (
    <SharedLayoutBg className="gap-1" pillClassName="rounded-[var(--ag-r-md)]">
      {items.map((entry) => (
        <AgentOverviewRow
          key={entry.key}
          entry={entry}
          diffStat={entry.isWorktree ? statsByPath[entry.path] : undefined}
          relativeDate={relativeDate(entry.updatedAt)}
          onOpen={onOpenThread}
        />
      ))}
    </SharedLayoutBg>
  );

  const filterTabs = [
    { id: "all" as const, label: t("agentWorkspace.filterAll"), count: providerEntries.length },
    {
      id: "needsYou" as const,
      label: t("agentWorkspace.needsYou"),
      count: counts.awaitingApproval + counts.failed,
    },
    {
      id: "working" as const,
      label: t("agentWorkspace.working"),
      count: counts.running,
    },
    {
      id: "ready" as const,
      label: t("agentWorkspace.ready"),
      count: counts.idle,
    },
    {
      id: "worktrees" as const,
      label: t("agentChat.worktrees"),
      count: providerEntries.filter((entry) => entry.isWorktree).length,
    },
  ];

  return (
    <section
      className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[var(--ag-canvas)]"
      data-testid="agent-command-center"
    >
      <header className="mx-auto flex w-full max-w-6xl shrink-0 flex-col gap-5 px-4 pt-6 pb-4 sm:px-6">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-[-0.04em] text-[var(--ag-text)]">
              {t("agentWorkspace.fleet")}
            </h1>
            <p className="mt-1 text-xs leading-5 text-[var(--ag-text-2)]">{t("agentOverview.subtitle")}</p>
            <div className="mt-3">
              <AgentFleetPulse
                counts={counts}
                total={providerEntries.length}
                costUsd={totalCost}
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {onNewSession ? (
              <m.button
                type="button"
                onClick={() => void newSession()}
                disabled={creating}
                aria-busy={creating}
                whileTap={reduce ? undefined : { scale: 0.97 }}
                transition={SPRING_PRESS}
                className="inline-flex h-9 items-center gap-2 rounded-[var(--ag-r-sm)] bg-[var(--ag-solid)] px-3.5 text-[12px] font-semibold text-[var(--ag-solid-fg)] outline-none transition-[filter,transform] duration-200 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
              >
                {creating ? <LoaderCircle className="size-3.5 motion-safe:animate-spin" /> : <Plus className="size-3.5" />}
                {t("agentWorkspace.newSession")}
              </m.button>
            ) : null}
            <m.button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing || loading}
              aria-busy={refreshing || loading}
              whileTap={reduce ? undefined : { scale: 0.95 }}
              transition={SPRING_PRESS}
              className="grid size-8 place-items-center rounded-[var(--ag-r-sm)] text-[var(--ag-text-2)] outline-none transition-colors hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)] focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t("agentOverview.refresh")}
              title={t("agentOverview.refresh")}
            >
              <RefreshCw className={cn("size-3.5", (refreshing || loading) && "motion-safe:animate-spin")} />
            </m.button>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-[var(--ag-line)] bg-[var(--ag-rail-bg)] p-2.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="flex h-9 min-w-0 basis-48 flex-1 items-center gap-2 rounded-lg border border-[var(--ag-line)] bg-[var(--ag-surface)] px-2.5 focus-within:ring-2 focus-within:ring-ring">
              <Search className="size-3.5 shrink-0 text-[var(--ag-text-3)]" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setQuery("");
                }}
                placeholder={t("agentOverview.searchPlaceholder")}
                aria-label={t("agentOverview.searchPlaceholder")}
                className="min-w-0 flex-1 bg-transparent text-xs text-[var(--ag-text)] outline-none placeholder:text-[var(--ag-text-3)] [&::-webkit-search-cancel-button]:appearance-none"
              />
              {query ? (
                <button type="button" onClick={() => { setQuery(""); searchRef.current?.focus(); }} aria-label={t("agentChat.clearSearch")} className="grid size-6 shrink-0 place-items-center rounded-md text-[var(--ag-text-2)] outline-none hover:bg-[var(--ag-hover)] focus-visible:ring-2 focus-visible:ring-ring">
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
            <div className="relative min-w-0 shrink-0">
              <select aria-label={t("agentOverview.providerFilter")} value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)} className="h-9 max-w-full appearance-none rounded-lg border border-[var(--ag-line)] bg-[var(--ag-surface)] py-1 pl-3 pr-8 text-xs text-[var(--ag-text-2)] outline-none transition-colors hover:border-[var(--ag-line-strong)] focus-visible:ring-2 focus-visible:ring-ring">
                <option value="all">{t("agentChat.allProviders")}</option>
                {AGENT_PROVIDERS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
              <ChevronDown aria-hidden className="pointer-events-none absolute top-3 right-2.5 size-3.5 text-[var(--ag-text-3)]" />
            </div>
          </div>
          <AgentSectionTabs
            items={filterTabs}
            value={filter}
            onChange={(id) => setFilter(id as OverviewFilter)}
            label={t("agentOverview.filterLabel")}
            layoutId="overview-filter-tab"
          />

        </div>
        {actionError ? (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p className="min-w-0 flex-1 whitespace-pre-line break-words">{actionError}</p>
            <button type="button" onClick={() => setActionError(null)} aria-label={t("common.close")} className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="size-4" /></button>
          </div>
        ) : null}
      </header>

      <ScrollArea className="min-h-0 flex-1" key={paginationKey}>
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pb-6 sm:px-6" aria-busy={loading || refreshing || query !== deferredQuery}>
          <div className="flex min-h-5 items-center justify-between gap-3 text-[11px] text-[var(--ag-text-3)]">
            <p role="status" className="tabular-nums">{loading || refreshing ? t("agentChat.loadingConversations") : t("agentOverview.showing", { shown: visible.length, total: matches.length })}</p>
            {hasFilters ? <button type="button" onClick={resetFilters} className="shrink-0 rounded-sm font-medium text-[var(--ag-text-2)] outline-none hover:text-[var(--ag-text)] focus-visible:ring-2 focus-visible:ring-ring">{t("agentOverview.resetFilters")}</button> : null}
          </div>
          {loading && entries.length === 0 ? (
            <div className="space-y-2 motion-safe:animate-pulse" aria-hidden>
              {[0, 1, 2, 3, 4].map((index) => <div key={index} className="flex h-20 gap-3 rounded-xl bg-[var(--ag-surface)] p-4"><span className="size-8 rounded-lg bg-[var(--ag-selected)]" /><span className="flex flex-1 flex-col gap-3"><span className="h-3 w-2/5 rounded bg-[var(--ag-selected)]" /><span className="h-2 w-3/5 rounded bg-[var(--ag-selected)]" /></span></div>)}
            </div>
          ) : visible.length === 0 ? (
            <AgentsEnter className="flex flex-col items-center justify-center py-16 text-center">
              <span className="mb-3 grid size-11 place-items-center rounded-2xl bg-[var(--ag-surface-2)]">
                {hasFilters ? <Search className="size-5 text-[var(--ag-text-3)]" /> : <MessagesSquare className="size-5 text-[var(--ag-text-3)]" />}
              </span>
              <p className="text-sm font-semibold text-[var(--ag-text)]">
                {hasFilters ? t("agentOverview.noMatches") : t("agentOverview.empty")}
              </p>
              <p className="mt-2 max-w-sm text-xs leading-5 text-[var(--ag-text-2)]">{t(hasFilters ? "agentOverview.noMatchesHint" : "agentOverview.emptyHint")}</p>
              {hasFilters ? (
                <button type="button" onClick={resetFilters} className="mt-4 rounded-lg bg-[var(--ag-solid)] px-3 py-2 text-xs font-medium text-[var(--ag-solid-fg)] outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("agentOverview.resetFilters")}</button>
              ) : onNewSession ? (
                <button
                  type="button"
                  onClick={() => void newSession()}
                  disabled={creating}
                  className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-[var(--ag-r-sm)] bg-[var(--ag-solid)] px-3 text-[12px] font-semibold text-[var(--ag-solid-fg)] outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Plus className="size-3.5" />
                  {t("agentWorkspace.newSession")}
                </button>
              ) : null}
            </AgentsEnter>
          ) : filter === "all" ? (
            <>
              <AgentCommandLane
                title={t("agentWorkspace.needsYou")}
                count={lanes.needsYou.length}
                tone="attention"
              >
                {renderRows(lanes.needsYou)}
              </AgentCommandLane>
              <AgentCommandLane
                title={t("agentWorkspace.working")}
                count={lanes.working.length}
                tone="work"
              >
                {renderRows(lanes.working)}
              </AgentCommandLane>
              <AgentCommandLane
                title={t("agentWorkspace.ready")}
                count={lanes.ready.length}
                tone="quiet"
              >
                {groupReady
                  ? readyGroups.map((group, index) => (
                      <AgentFleetRepoGroup
                        key={group.path}
                        repoName={group.repoName}
                        count={group.entries.length}
                        defaultOpen={index === 0}
                      >
                        {renderRows(group.entries)}
                      </AgentFleetRepoGroup>
                    ))
                  : renderRows(lanes.ready)}
              </AgentCommandLane>
            </>
          ) : (
            renderRows(visible)
          )}
          {matches.length > visible.length ? (
            <button type="button" onClick={() => setPagination({ key: paginationKey, limit: limit + PAGE_SIZE })} className="mx-auto inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--ag-line)] bg-[var(--ag-surface)] px-4 text-xs font-medium text-[var(--ag-text-2)] outline-none transition-colors hover:bg-[var(--ag-hover)] focus-visible:ring-2 focus-visible:ring-ring">
              <ChevronDown className="size-3.5" />
              {t("agentChat.showMoreConversations", { count: Math.min(PAGE_SIZE, matches.length - visible.length) })}
            </button>
          ) : null}
        </div>
      </ScrollArea>
    </section>
  );
}
