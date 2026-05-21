export type RemoteCiCheck = {
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string | null;
  details_url?: string | null;
  ci_kind?: string | null;
  key?: string | null;
  head_sha?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  description?: string | null;
  output_title?: string | null;
  output_summary?: string | null;
  output_text?: string | null;
  app_name?: string | null;
  app_slug?: string | null;
  check_suite_id?: string | null;
  check_run_id?: string | null;
  external_id?: string | null;
  annotations_count?: number | null;
  status_uuid?: string | null;
};

export type CheckAnnotation = {
  path: string;
  start_line: number;
  end_line: number;
  annotation_level: string;
  title?: string | null;
  message: string;
  raw_details?: string | null;
  blob_href?: string | null;
};

export type WorkflowRun = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  workflow_id: number;
  head_branch: string | null;
  head_sha: string;
  run_number: number;
  event: string;
  created_at: string;
  updated_at: string;
  html_url: string;
  run_started_at: string | null;
  actor_login: string | null;
  actor_avatar: string | null;
  display_title: string | null;
  run_attempt: number | null;
  /** e.g. ".github/workflows/release.yml@refs/heads/main" */
  workflow_path: string | null;
};

export type WorkflowStep = {
  name: string;
  status: string;
  conclusion: string | null;
  number: number;
  started_at: string | null;
  completed_at: string | null;
};

export type WorkflowJob = {
  id: number;
  run_id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  html_url: string | null;
  steps: WorkflowStep[];
};

// ── shared helpers ────────────────────────────────────────────────────────────

/** Returns a normalised status key used for icon/colour decisions. */
export function ciStatusKey(
  status: string,
  conclusion: string | null,
): string {
  return (conclusion ?? status ?? "").toLowerCase();
}

/** Tailwind text-colour class for a status key. */
export function ciStatusColor(key: string): string {
  if (["success", "successful", "passed"].includes(key))
    return "text-git-added";
  if (
    ["failure", "failed", "timed_out", "error", "action_required"].includes(key)
  )
    return "text-git-removed";
  if (["cancelled", "skipped", "neutral", "stale"].includes(key))
    return "text-muted-foreground";
  if (["in_progress", "queued", "pending", "inprogress", "waiting"].includes(key))
    return "text-primary";
  return "text-muted-foreground";
}

/** Format a duration between two ISO date strings, e.g. "1m 23s" or "45s". */
export function formatDuration(
  startStr: string | null | undefined,
  endStr: string | null | undefined,
): string | null {
  if (!startStr || !endStr) return null;
  const diff = Math.floor(
    (new Date(endStr).getTime() - new Date(startStr).getTime()) / 1000,
  );
  if (diff < 0) return null;
  if (diff < 60) return `${diff}s`;
  return `${Math.floor(diff / 60)}m ${diff % 60}s`;
}

/** Human-readable relative time, e.g. "2m ago". */
export function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const diff = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000,
  );
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/**
 * Extract the bare filename from a GitHub workflow `path` field.
 * e.g. ".github/workflows/release.yml@refs/heads/main" → "release.yml"
 */
export function workflowFileName(workflowPath: string | null | undefined): string | null {
  if (!workflowPath) return null;
  return workflowPath.split("@")[0].split("/").pop() ?? null;
}

/**
 * Group workflow jobs into sequential stages using start-time proximity.
 * Jobs that start within `windowMs` of each other are placed in the same stage.
 */
export function groupJobsByStage(
  jobs: WorkflowJob[],
  windowMs = 30_000,
): WorkflowJob[][] {
  if (jobs.length === 0) return [];
  const sorted = [...jobs].sort((a, b) => {
    const ta = a.started_at ? new Date(a.started_at).getTime() : 0;
    const tb = b.started_at ? new Date(b.started_at).getTime() : 0;
    return ta - tb;
  });
  const stages: WorkflowJob[][] = [];
  let current: WorkflowJob[] = [sorted[0]];
  let stageT = sorted[0].started_at ? new Date(sorted[0].started_at).getTime() : 0;
  for (let i = 1; i < sorted.length; i++) {
    const job = sorted[i];
    const t = job.started_at ? new Date(job.started_at).getTime() : stageT;
    if (t - stageT > windowMs) {
      stages.push(current);
      current = [job];
      stageT = t;
    } else {
      current.push(job);
    }
  }
  stages.push(current);
  return stages;
}
