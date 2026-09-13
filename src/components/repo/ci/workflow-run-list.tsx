import { ScrollArea } from "@/components/ui/scroll-area";
import { PanelEmptyHint } from "@/components/onboarding/panel-empty-hint";
import { Button } from "@/components/ui/button";
import { Search, SlidersHorizontal, Workflow, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { WorkflowRun, ciStatusKey } from "./ci-types";
import { WorkflowRunRow } from "./workflow-run-row";
import { CiViewOptions } from "./ci-view-options";

export function runCategory(run: Pick<WorkflowRun, "status" | "conclusion">) {
  const key = ciStatusKey(run.status, run.conclusion);
  if (
    ["in_progress", "inprogress", "queued", "pending", "waiting"].includes(key)
  )
    return "running";
  if (
    ["failure", "failed", "timed_out", "action_required", "error"].includes(key)
  )
    return "failed";
  if (["success", "successful", "passed"].includes(key)) return "success";
  return "other";
}

export function filterWorkflowRuns(runs: WorkflowRun[], view: CiViewOptions) {
  const query = view.query.trim().toLowerCase();
  return runs
    .filter(
      (run) =>
        (view.status === "all" || runCategory(run) === view.status) &&
        (!view.branch || run.head_branch === view.branch) &&
        (!view.workflow || String(run.workflow_id) === view.workflow) &&
        (!query ||
          [
            run.name,
            run.display_title,
            run.head_sha,
            run.head_branch,
            run.actor_login,
            String(run.run_number),
          ].some((value) => value?.toLowerCase().includes(query))),
    )
    .sort(
      (a, b) =>
        (Date.parse(a.created_at) - Date.parse(b.created_at)) *
        (view.sort === "oldest" ? 1 : -1),
    );
}

export function WorkflowRunList({
  runs,
  loading,
  path,
  onRefresh,
  selectedId,
  onSelect,
  view,
  onViewChange,
}: {
  runs: WorkflowRun[] | null;
  loading: boolean;
  path: string;
  onRefresh: () => void;
  selectedId?: number | null;
  onSelect?: (run: WorkflowRun) => void;
  view: CiViewOptions;
  onViewChange: (next: Partial<CiViewOptions>) => void;
}) {
  const { t } = useTranslation();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const filtered = useMemo(
    () => filterWorkflowRuns(runs ?? [], view),
    [runs, view],
  );
  const branches = [
    ...new Set(
      (runs ?? []).flatMap((run) => (run.head_branch ? [run.head_branch] : [])),
    ),
  ].sort();
  const workflows = [
    ...new Map(
      (runs ?? []).map((run) => [String(run.workflow_id), run.name]),
    ).entries(),
  ];
  const filters = [
    { key: "all", label: t("ci.filterAll"), color: "bg-foreground" },
    { key: "running", label: t("ci.filterRunning"), color: "bg-primary" },
    { key: "failed", label: t("ci.filterFailed"), color: "bg-git-removed" },
    { key: "success", label: t("ci.filterSuccess"), color: "bg-git-added" },
  ];
  const reset = () =>
    onViewChange({ query: "", status: "all", branch: "", workflow: "" });
  if (loading && !runs)
    return (
      <div
        className="space-y-3 p-5"
        aria-label={t("ci.headerLoading")}
        role="status"
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-20 rounded-lg bg-muted motion-safe:animate-pulse"
          />
        ))}
      </div>
    );

  return (
    <div className="ci-runs flex h-full min-h-0 flex-col">
      <div className="ci-status-overview">
        {filters.map((filter) => (
          <button
            key={filter.key}
            type="button"
            aria-pressed={view.status === filter.key}
            onClick={() => onViewChange({ status: filter.key })}
            className="ci-stat"
          >
            <span className="flex items-center gap-2">
              <span className={`size-1.5 rounded-full ${filter.color}`} />
              {filter.label}
            </span>
            <strong>
              {
                (runs ?? []).filter(
                  (run) =>
                    filter.key === "all" || runCategory(run) === filter.key,
                ).length
              }
            </strong>
          </button>
        ))}
      </div>
      <div className="ci-toolbar">
        <label className="ci-search">
          <Search className="size-4 shrink-0" />
          <input
            aria-label={t("ci.searchRuns")}
            placeholder={t("ci.searchRuns")}
            value={view.query}
            onChange={(event) => onViewChange({ query: event.target.value })}
          />
          {view.query && (
            <button
              type="button"
              aria-label={t("ci.clearSearch")}
              onClick={() => onViewChange({ query: "" })}
            >
              <X className="size-3.5" />
            </button>
          )}
        </label>
        <Button
          variant="outline"
          size="sm"
          aria-expanded={optionsOpen}
          onClick={() => setOptionsOpen(!optionsOpen)}
        >
          <SlidersHorizontal />
          {t("ci.viewOptions")}
        </Button>
        <div className="ci-filter-controls">
          <select
            aria-label={t("ci.allWorkflows")}
            value={view.workflow}
            onChange={(event) => onViewChange({ workflow: event.target.value })}
          >
            <option value="">{t("ci.allWorkflows")}</option>
            {workflows.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <select
            aria-label={t("ci.allBranches")}
            value={view.branch}
            onChange={(event) => onViewChange({ branch: event.target.value })}
          >
            <option value="">{t("ci.allBranches")}</option>
            {branches.map((branch) => (
              <option key={branch}>{branch}</option>
            ))}
          </select>
          <select
            aria-label={t("ci.sortRuns")}
            value={view.sort}
            onChange={(event) => onViewChange({ sort: event.target.value })}
          >
            <option value="newest">{t("ci.newestFirst")}</option>
            <option value="oldest">{t("ci.oldestFirst")}</option>
          </select>
        </div>
        {optionsOpen && (
          <div className="ci-view-options">
            <label>
              <input
                type="checkbox"
                checked={view.compact}
                onChange={(event) =>
                  onViewChange({ compact: event.target.checked })
                }
              />
              {t("ci.compactView")}
            </label>
            <label>
              <input
                type="checkbox"
                checked={view.metadata}
                onChange={(event) =>
                  onViewChange({ metadata: event.target.checked })
                }
              />
              {t("ci.showMetadata")}
            </label>
            <span>{t("ci.viewSaved")}</span>
          </div>
        )}
      </div>
      <div className="ci-list-caption">
        <span>{t("ci.runCount", { count: filtered.length })}</span>
        {(view.query ||
          view.status !== "all" ||
          view.branch ||
          view.workflow) && (
          <button type="button" onClick={reset}>
            {t("ci.resetFilters")}
          </button>
        )}
      </div>
      {!runs?.length ? (
        <div className="ci-empty">
          <Workflow className="size-8" />
          <p>{t("ci.noRuns")}</p>
          <PanelEmptyHint
            hint={t("ci.emptyProviderHint")}
            settingsHash="accounts"
            actionLabel={t("ci.emptyProviderAction")}
          />
        </div>
      ) : !filtered.length ? (
        <div className="ci-empty">
          <Search className="size-8" />
          <p>{t("ci.noMatchingRuns")}</p>
          <Button variant="outline" size="sm" onClick={reset}>
            {t("ci.resetFilters")}
          </Button>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1 px-4 pb-4">
          <div
            className="ci-run-table"
            data-compact={view.compact}
            data-metadata={view.metadata}
          >
            {filtered.map((run) => (
              <WorkflowRunRow
                key={run.id}
                run={run}
                path={path}
                onRefresh={onRefresh}
                selected={run.id === selectedId}
                onSelect={onSelect}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
