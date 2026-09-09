import { Button } from "@/components/ui/button";
import { toastError } from "@/lib/error-toast";
import { invoke } from "@tauri-apps/api/core";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  ExternalLink,
  GitBranch,
  Loader2,
  RefreshCw,
  SkipForward,
  Square,
  XCircle,
} from "lucide-react";
import { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  WorkflowJob,
  WorkflowRun,
  ciStatusKey,
  formatDuration,
  timeAgo,
} from "./ci-types";
import { PulseIcon, SpinIcon } from "@/components/motion/kit";
import { m } from "motion/react";

// ── Status icon ───────────────────────────────────────────────────────────────

const RunStatusIcon = memo(function RunStatusIcon({
  status,
  conclusion,
  size = "md",
}: {
  status: string;
  conclusion: string | null;
  size?: "sm" | "md";
}) {
  const key = ciStatusKey(status, conclusion);
  const cls = size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5";

  if (["success", "successful", "passed"].includes(key))
    return <CheckCircle2 className={`${cls} shrink-0 text-git-added`} />;

  if (["failure", "failed", "timed_out", "error", "action_required"].includes(key))
    return <XCircle className={`${cls} shrink-0 text-git-removed`} />;

  if (["cancelled"].includes(key))
    return <Square className={`${cls} shrink-0 text-muted-foreground`} />;

  if (["skipped", "neutral", "stale"].includes(key))
    return <SkipForward className={`${cls} shrink-0 text-muted-foreground`} />;

  if (["in_progress", "queued", "pending", "inprogress", "waiting"].includes(key))
    return (
      <SpinIcon icon={Loader2}
        className={`${cls} shrink-0 text-primary`}
      />
    );

  return <CircleDashed className={`${cls} shrink-0 text-muted-foreground`} />;
});

// ── Step row ──────────────────────────────────────────────────────────────────

function StepRow({ step }: { step: WorkflowJob["steps"][number] }) {
  const dur = formatDuration(step.started_at, step.completed_at);
  return (
    <div className="flex items-center gap-2 py-0.5 pl-5 text-xs text-muted-foreground/80">
      <RunStatusIcon status={step.status} conclusion={step.conclusion} size="sm" />
      <span className="flex-1 truncate">
        {step.number}. {step.name}
      </span>
      {dur && <span className="shrink-0 font-mono text-[0.6875rem]">{dur}</span>}
    </div>
  );
}

// ── Job row ───────────────────────────────────────────────────────────────────

const JobRow = memo(function JobRow({ job }: { job: WorkflowJob }) {
  const { t } = useTranslation();
  const [stepsOpen, setStepsOpen] = useState(false);
  const dur = formatDuration(job.started_at, job.completed_at);

  return (
    <div className="flex flex-col">
      <div
        className="group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-muted/30"
        onClick={() => job.steps.length > 0 && setStepsOpen((o) => !o)}
      >
        <RunStatusIcon status={job.status} conclusion={job.conclusion} size="sm" />
        <span className="flex-1 truncate text-xs font-medium text-foreground/80">
          {job.name}
        </span>
        {dur && (
          <span className="shrink-0 font-mono text-[0.6875rem] text-muted-foreground">
            {dur}
          </span>
        )}
        {job.html_url && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation();
              window.open(job.html_url!, "_blank", "noopener,noreferrer");
            }}
            className="shrink-0 opacity-0 group-hover:opacity-100"
            title={t("ci.openInBrowser")}
          >
            <ExternalLink />
          </Button>
        )}
        {job.steps.length > 0 && (
          <div className="shrink-0 text-muted-foreground">
            {stepsOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </div>
        )}
      </div>

      {stepsOpen && job.steps.length > 0 && (
        <div className="flex flex-col pb-1 pl-4">
          {job.steps.map((step) => (
            <StepRow key={step.number} step={step} />
          ))}
        </div>
      )}
    </div>
  );
});

// ── Event badge ───────────────────────────────────────────────────────────────

function EventBadge({ event }: { event: string }) {
  const label = event.replace(/_/g, " ");
  return (
    <span className="inline-flex items-center rounded-full border border-border/40 px-1.5 py-0 text-[0.6875rem] font-medium text-muted-foreground">
      {label}
    </span>
  );
}

// ── Workflow run row ──────────────────────────────────────────────────────────

export const WorkflowRunRow = memo(function WorkflowRunRow({
  run,
  path,
  onRefresh,
  selected,
  onSelect,
}: {
  run: WorkflowRun;
  path: string;
  onRefresh: () => void;
  selected?: boolean;
  onSelect?: (run: WorkflowRun) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [jobs, setJobs] = useState<WorkflowJob[] | null>(null);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [actioning, setActioning] = useState<"rerun" | "cancel" | null>(null);

  const key = ciStatusKey(run.status, run.conclusion);
  const dur = formatDuration(run.run_started_at, run.updated_at);
  const ago = timeAgo(run.created_at);
  const sha7 = run.head_sha.substring(0, 7);

  const isRunning = ["in_progress", "queued", "pending", "waiting"].includes(
    run.status.toLowerCase(),
  );
  const isDone = !isRunning;
  const canRerun = isDone && run.html_url; // only GitHub runs have html_url
  const canCancel = isRunning && run.html_url;

  const loadJobs = useCallback(async () => {
    if (jobs !== null) return;
    setJobsLoading(true);
    try {
      const res = await invoke<WorkflowJob[]>("get_workflow_jobs", {
        path,
        runId: run.id,
      });
      setJobs(res);
    } catch (e) {
      toastError(String(e));
      setJobs([]);
    } finally {
      setJobsLoading(false);
    }
  }, [jobs, path, run.id]);

  const handleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) void loadJobs();
  };

  const handleRerun = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setActioning("rerun");
    try {
      await invoke("rerun_workflow", { path, runId: run.id });
      onRefresh();
    } catch (err) {
      toastError(String(err));
    } finally {
      setActioning(null);
    }
  };

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setActioning("cancel");
    try {
      await invoke("cancel_workflow", { path, runId: run.id });
      onRefresh();
    } catch (err) {
      toastError(String(err));
    } finally {
      setActioning(null);
    }
  };

  const statusBg = (() => {
    if (selected) return "border-l-primary bg-primary/5";
    if (["success", "successful", "passed"].includes(key))
      return "border-l-git-added/60";
    if (["failure", "failed", "timed_out", "error", "action_required"].includes(key))
      return "border-l-git-removed/60";
    if (isRunning) return "border-l-primary/60";
    return "border-l-border/40";
  })();

  return (
    <m.div
      className={`ci-run-row group flex flex-col ${statusBg}`}
      data-selected={!!selected}
    >
      {/* ── Main row ── */}
      <div
        className="ci-run-main flex cursor-pointer items-start gap-3"
        aria-label={`${run.name} #${run.run_number} · ${key.replace(/_/g, " ")}`}
        role="button"
        tabIndex={0}
        {...(onSelect ? { "aria-pressed": !!selected } : { "aria-expanded": expanded })}
        onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onSelect ? onSelect(run) : handleExpand(); } }}
        onClick={() => onSelect ? onSelect(run) : handleExpand()}
      >
        {/* Status icon */}
        <div className="mt-0.5 shrink-0">
          <RunStatusIcon status={run.status} conclusion={run.conclusion} />
        </div>

        {/* Text content */}
        <div className="min-w-0 flex-1">
          {/* Name + run number */}
          <div className="flex items-baseline gap-1.5">
            <span className="truncate text-sm font-semibold text-foreground/90 transition-colors group-hover:text-foreground">
              {run.name}
            </span>
            <span className="shrink-0 font-mono text-[0.6875rem] text-muted-foreground">
              #{run.run_number}
            </span>
            {run.run_attempt != null && run.run_attempt > 1 && (
              <span className="shrink-0 text-[0.6875rem] text-muted-foreground">
                {t("ci.attempt", { n: run.run_attempt })}
              </span>
            )}
          </div>

          {/* Commit message */}
          {run.display_title && (
            <p className="ci-run-title mt-1 truncate text-sm text-foreground/80">
              {run.display_title}
            </p>
          )}

          {/* Meta row */}
          <div className="ci-run-meta mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            {run.head_branch && (
              <span className="flex items-center gap-1 text-[0.6875rem] text-muted-foreground">
                <GitBranch className="h-3 w-3" />
                <span className="max-w-[120px] truncate font-medium">
                  {run.head_branch}
                </span>
              </span>
            )}
            <EventBadge event={run.event} />
            <span className="font-mono text-[0.6875rem] text-muted-foreground">
              {sha7}
            </span>
            {run.actor_login && (
              <span className="flex items-center gap-1 text-[0.6875rem] text-muted-foreground">
                {run.actor_avatar && (
                  <img
                    src={run.actor_avatar}
                    alt={run.actor_login}
                    className="h-3.5 w-3.5 rounded-full"
                  />
                )}
                {run.actor_login}
              </span>
            )}
            <span className="text-[0.6875rem] text-muted-foreground">{ago}</span>
            {dur && (
              <span className="text-[0.6875rem] text-muted-foreground">
                · {dur}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="ci-run-actions flex shrink-0 items-center gap-0.5">
          {canRerun && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={actioning === "rerun"}
              onClick={handleRerun}
              title={t("ci.rerun")}
            >
              <SpinIcon icon={RefreshCw} active={actioning === "rerun"} />
            </Button>
          )}
          {canCancel && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={actioning === "cancel"}
              onClick={handleCancel}
              className="hover:bg-destructive/10 hover:text-destructive"
              title={t("ci.cancelRun")}
            >
              <PulseIcon icon={Square} active={actioning === "cancel"} />
            </Button>
          )}
          {run.html_url && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={(e) => {
                e.stopPropagation();
                window.open(run.html_url, "_blank", "noopener,noreferrer");
              }}
              title={t("ci.openInBrowser")}
            >
              <ExternalLink />
            </Button>
          )}
          {!onSelect && (
            <div className="p-1.5 text-muted-foreground">
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Jobs section ── */}
      {expanded && (
        <div className="border-t border-border/20 px-3 pb-2 pt-1.5">
          {jobsLoading ? (
            <div className="flex items-center justify-center py-3">
              <SpinIcon icon={Loader2} className="h-4 w-4 text-primary/40" />
            </div>
          ) : !jobs || jobs.length === 0 ? (
            <p className="py-2 text-center text-xs text-muted-foreground">
              {t("ci.noJobs")}
            </p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {jobs.map((job) => (
                <JobRow key={job.id} job={job} />
              ))}
            </div>
          )}
        </div>
      )}
    </m.div>
  );
});
