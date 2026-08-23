import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { SpinIcon } from "@/components/motion/kit";

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
        <SpinIcon icon={Loader2} className="h-3 w-3" />
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
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => void loadJobs()}
              disabled={jobsLoading}
              title={t("ci.refreshAria")}
            >
              <SpinIcon icon={RefreshCw} active={jobsLoading} />
            </Button>
            {run.html_url && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() =>
                  window.open(run.html_url, "_blank", "noopener,noreferrer")
                }
                title={t("ci.openInBrowser")}
              >
                <ExternalLink />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              title="Close"
            >
              <X />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as typeof tab)}
        className="shrink-0 border-b border-border/50 px-3"
      >
        <TabsList variant="line">
          <TabsTrigger value="pipeline">
            <Share2 />
            Pipeline
          </TabsTrigger>
          <TabsTrigger value="yaml">
            <FileCode2 />
            Workflow-Datei
            {yamlFile && (
              <Badge variant="secondary" className="font-mono">
                {yamlFile}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* ── Tab content ── */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "pipeline" ? (
          // Graph view
          jobsLoading ? (
            <div className="flex h-full items-center justify-center">
              <SpinIcon icon={Loader2} className="h-8 w-8 text-primary/40" />
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
