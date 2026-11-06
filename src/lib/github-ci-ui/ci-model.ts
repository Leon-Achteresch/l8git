import type { GithubDeploymentStatus } from "@/lib/github-expansion/api";
import type { CiJob, CiRun } from "@/lib/github-expansion/ci";
import type { WorkflowInput } from "@/lib/github-expansion/forms";

// ── 45 Matrix ────────────────────────────────────────────────────────────────
/**
 * Groups jobs by GitHub's default matrix job-name pattern `base (v1, v2)`.
 * The API does not expose matrix values, so this is a name heuristic: a custom
 * `name:` can hide or fake a matrix. The UI labels it accordingly.
 */
export type MatrixGroup = { base: string; cells: { variant: string[]; job: CiJob }[] };
export function groupMatrix(jobs: CiJob[]): { groups: MatrixGroup[]; single: CiJob[] } {
  const byBase = new Map<string, MatrixGroup>();
  const single: CiJob[] = [];
  for (const job of jobs) {
    const m = /^(.+?) \((.+)\)$/.exec(job.name);
    if (!m) { single.push(job); continue; }
    const group = byBase.get(m[1]) ?? { base: m[1], cells: [] };
    group.cells.push({ variant: m[2].split(", "), job });
    byBase.set(m[1], group);
  }
  const groups: MatrixGroup[] = [];
  for (const g of byBase.values()) {
    if (g.cells.length > 1) groups.push(g);
    else single.push(g.cells[0].job);
  }
  return { groups, single };
}

// ── 42 Baseline ──────────────────────────────────────────────────────────────
/** Most recent successful completed run of the same workflow created before `run`. */
export function lastGreenBefore(run: CiRun, runs: CiRun[]): CiRun | null {
  return runs
    .filter((r) => r.id !== run.id && r.workflow_id === run.workflow_id && r.conclusion === "success" && r.created_at < run.created_at)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
}

export function isFailed(c: string | null): boolean {
  return c === "failure" || c === "timed_out" || c === "startup_failure";
}

// ── 43 Dispatch ──────────────────────────────────────────────────────────────
export type InputValue = string | boolean | number;
export function initialInputValues(schema: WorkflowInput[]): Record<string, InputValue> {
  const out: Record<string, InputValue> = {};
  for (const i of schema) {
    if (i.type === "boolean") out[i.name] = i.default === true || i.default === "true";
    else if (i.default !== undefined) out[i.name] = i.type === "number" ? Number(i.default) : String(i.default);
    else if (i.type === "choice" && i.required && i.options[0] !== undefined) out[i.name] = i.options[0];
  }
  return out;
}

/** Form text → typed value (number inputs stay strings until they parse; empty is omitted). */
export function coerceInputs(schema: WorkflowInput[], raw: Record<string, InputValue>): Record<string, InputValue> {
  const out: Record<string, InputValue> = {};
  for (const i of schema) {
    const v = raw[i.name];
    if (v === undefined || v === "") continue;
    out[i.name] = i.type === "number" && typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : v;
  }
  return out;
}

/** Environment inputs must name a configured environment when the list is known. */
export function environmentErrors(schema: WorkflowInput[], values: Record<string, InputValue>, environments: string[] | null): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!environments) return errors;
  for (const i of schema) {
    const v = values[i.name];
    if (i.type === "environment" && typeof v === "string" && v && !environments.includes(v)) errors[i.name] = "environment";
  }
  return errors;
}

/**
 * Runs that can be the one we just created: new ids only, same workflow, ref, actor-less filter
 * by event and creation time. Callers must treat >1 match as ambiguous instead of guessing.
 */
export function dispatchedRunCandidates(runs: (CiRun & { actor?: { login: string } | null })[], opts: { before: Set<number>; workflowId: number; ref: string; since: number; login: string }): CiRun[] {
  return runs.filter((r) =>
    !opts.before.has(r.id) && r.workflow_id === opts.workflowId && r.event === "workflow_dispatch"
    && r.head_branch === opts.ref && Date.parse(r.created_at) >= opts.since - 5_000
    && (!r.actor || r.actor.login.toLowerCase() === opts.login.toLowerCase()));
}

export function returnedRunId(response: unknown): number | null {
  const v = response && typeof response === "object" ? (response as { workflow_run_id?: unknown }).workflow_run_id : undefined;
  return typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : null;
}

// ── 48 Deployments ───────────────────────────────────────────────────────────
/** Only http(s) URLs are opened; anything else is shown as text. */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Latest status per GitHub's newest-first order; no status means state unknown, not "pending". */
export function latestDeploymentState(statuses: GithubDeploymentStatus[]): GithubDeploymentStatus | null {
  return [...statuses].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
}

// ── 47 Retries ───────────────────────────────────────────────────────────────
export function attemptNumbers(run: CiRun, cap = 10): number[] {
  const last = Math.max(1, run.run_attempt || 1);
  const first = Math.max(1, last - cap + 1);
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}
