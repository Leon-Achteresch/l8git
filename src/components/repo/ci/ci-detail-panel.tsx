import { toastError } from "@/lib/error-toast";
import { invoke } from "@tauri-apps/api/core";
import {
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  FileCode2,
  GitBranch,
  Loader2,
  RefreshCw,
  Share2,
  Square,
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CiWorkflowGraph } from "./ci-workflow-graph";
import { CiYamlEditor } from "./ci-yaml-editor";
import {
  WorkflowJob,
  WorkflowRun,
  ciStatusKey,
  formatDuration,
  timeAgo,
  workflowFileName,
} from "./ci-types";

type Tab = "pipeline" | "yaml";

// ── Small inline status label ───────────────────────────────────────────────

function StatusPill({
  status,
  conclusion,
}: {
  status: string;
  conclusion: string | null;
}) {
  const key = ciStatusKey(status, conclusion);
  const label = conclusion ?? status;

  if (["success", "successful", "passed"].includes(key))
    return (
      <span className="flex items-center gap-1 rounded-full bg-git-added/10 px-2 py-0.5 text-[10px] font-semibold capitalize text-git-added">
        <CheckCircle2 className="h-3 w-3" />
        {label}
      </span>
    );

  if (["failure", "failed", "timed_out", "error", "action_required"].includes(key))
    return (
      <span className="flex items-center gap-1 rounded-full bg-git-removed/10 px-2 py-0.5 text-[10px] font-semibold capitalize text-git-removed">
        <XCircle className="h-3 w-3" />
        {label}
      </span>
    );

  if (["in_progress", "queued", "pending", "waiting"].includes(key))
    return (
      <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold capitalize text-primary">
        <Loader2 className="h-3 w-3 animate-spin" />
        {label}
      </span>
    );

  if (["cancelled"].includes(key))
    return (
      <span className="flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-semibold capitalize text-muted-foreground">
        <Square className="h-3 w-3" />
        {label}
      </span>
    );

  return (
    <span className="flex items-center gap-1 rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-semibold capitalize text-muted-foreground">
      <CircleDashed className="h-3 w-3" />
      {label}
    </span>
  );
}

// ── Main detail panel ──────────────────────────────────────────────────────

export function CiDetailPanel({
  run,
  path,
  onClose,
}: {
  run: WorkflowRun;
  path: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("pipeline");
  const [jobs, setJobs] = useState<WorkflowJob[] | null>(null);
  const [jobsLoading, setJobsLoading] = useState(true);

  const yamlFile = workflowFileName(run.workflow_path);
  const sha7 = run.head_sha.substring(0, 7);
  const dur = formatDuration(run.run_started_at, run.updated_at);
  const ago = timeAgo(run.created_at);

  const loadJobs = useCallback(async () => {
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
  }, [path, run.id]);

  useEffect(() => {
    setJobs(null);
    setJobsLoading(true);
    void loadJobs();
  }, [loadJobs]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="shrink-0 border-b border-border/50 px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {/* Workflow name + run number */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-bold text-foreground">
                {run.name}
              </span>
              <span className="font-mono text-xs text-muted-foreground/70">
                #{run.run_number}
              </span>
              <StatusPill status={run.status} conclusion={run.conclusion} />
            </div>

            {/* Commit message */}
            {run.display_title && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground/80">
                {run.display_title}
              </p>
            )}

            {/* Meta */}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              {run.head_branch && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
                  <GitBranch className="h-3 w-3" />
                  {run.head_branch}
                </span>
              )}
              <span className="font-mono text-[11px] text-muted-foreground/60">
                {sha7}
              </span>
              {run.actor_avatar && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
                  <img
                    src={run.actor_avatar}
                    alt={run.actor_login ?? ""}
                    className="h-4 w-4 rounded-full"
                  />
                  {run.actor_login}
                </span>
              )}
              <span className="text-[11px] text-muted-foreground/60">{ago}</span>
              {dur && (
                <span className="text-[11px] text-muted-foreground/60">
                  · {dur}
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => void loadJobs()}
              disabled={jobsLoading}
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-40"
              title={t("ci.refreshAria")}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${jobsLoading ? "animate-spin" : ""}`}
              />
            </button>
            {run.html_url && (
              <button
                type="button"
                onClick={() =>
                  window.open(run.html_url, "_blank", "noopener,noreferrer")
                }
                className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                title={t("ci.openInBrowser")}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              title="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex shrink-0 border-b border-border/50 px-3">
        <button
          type="button"
          onClick={() => setTab("pipeline")}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
            tab === "pipeline"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Share2 className="h-3.5 w-3.5" />
          Pipeline
        </button>
        <button
          type="button"
          onClick={() => setTab("yaml")}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
            tab === "yaml"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileCode2 className="h-3.5 w-3.5" />
          Workflow-Datei
          {yamlFile && (
            <span className="rounded bg-muted/60 px-1 font-mono text-[10px] text-muted-foreground">
              {yamlFile}
            </span>
          )}
        </button>
      </div>

      {/* ── Tab content ── */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "pipeline" ? (
          // Graph view
          jobsLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
            </div>
          ) : (
            <CiWorkflowGraph jobs={jobs ?? []} />
          )
        ) : (
          // YAML editor
          <CiYamlEditor repoPath={path} initialFile={yamlFile} />
        )}
      </div>
    </div>
  );
}
