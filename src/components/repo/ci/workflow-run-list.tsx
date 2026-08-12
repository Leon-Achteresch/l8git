import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { WorkflowRun } from "./ci-types";
import { WorkflowRunRow } from "./workflow-run-row";

type StatusFilter = "all" | "running" | "failed" | "success";

function isRunning(r: WorkflowRun) {
  return ["in_progress", "queued", "pending", "waiting"].includes(
    r.status.toLowerCase(),
  );
}

function isFailed(r: WorkflowRun) {
  return ["failure", "failed", "timed_out", "action_required", "error"].includes(
    (r.conclusion ?? "").toLowerCase(),
  );
}

function isSuccess(r: WorkflowRun) {
  return ["success", "successful", "passed"].includes(
    (r.conclusion ?? "").toLowerCase(),
  );
}

export function WorkflowRunList({
  runs,
  loading,
  path,
  onRefresh,
  selectedId,
  onSelect,
}: {
  runs: WorkflowRun[] | null;
  loading: boolean;
  path: string;
  onRefresh: () => void;
  selectedId?: number | null;
  onSelect?: (run: WorkflowRun) => void;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<StatusFilter>("all");

  const filtered = useMemo(() => {
    if (!runs) return [];
    switch (filter) {
      case "running":
        return runs.filter(isRunning);
      case "failed":
        return runs.filter(isFailed);
      case "success":
        return runs.filter(isSuccess);
      default:
        return runs;
    }
  }, [runs, filter]);

  const counts = useMemo(() => {
    if (!runs) return { running: 0, failed: 0, success: 0 };
    return {
      running: runs.filter(isRunning).length,
      failed: runs.filter(isFailed).length,
      success: runs.filter(isSuccess).length,
    };
  }, [runs]);

  if (loading && !runs) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
      </div>
    );
  }

  const filterBtns: { key: StatusFilter; label: string; count?: number; dot?: string }[] = [
    { key: "all", label: t("ci.filterAll") },
    {
      key: "running",
      label: t("ci.filterRunning"),
      count: counts.running,
      dot: "bg-primary",
    },
    {
      key: "failed",
      label: t("ci.filterFailed"),
      count: counts.failed,
      dot: "bg-git-removed",
    },
    {
      key: "success",
      label: t("ci.filterSuccess"),
      count: counts.success,
      dot: "bg-git-added",
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {/* Filter pills */}
      {runs && runs.length > 0 && (
        <ToggleGroup
          type="single"
          value={filter}
          onValueChange={(value) => value && setFilter(value as typeof filter)}
          variant="outline"
          size="sm"
          className="flex-wrap px-2"
        >
          {filterBtns.map((btn) => (
            <ToggleGroupItem key={btn.key} value={btn.key} aria-label={btn.label}>
              {btn.dot && (
                <span className={`size-1.5 rounded-full ${btn.dot}`} />
              )}
              {btn.label}
              {btn.count != null && btn.count > 0 && (
                <Badge variant="secondary" className="tabular-nums">
                  {btn.count}
                </Badge>
              )}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}

      {/* Run list */}
      {!runs || filtered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground/70">
          {t("ci.noRuns")}
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1 px-2 pb-2">
          <div className="flex flex-col gap-1.5">
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
