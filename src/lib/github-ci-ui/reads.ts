import { enc, hubApi } from "@/lib/hub/api";
import type { HubAccount } from "@/lib/hub/types";
import type { CiRun } from "@/lib/github-expansion/ci";

// Small GitHub reads the CI UI needs that api.ts/ci.ts do not export yet (see CI-UI.md request 3).
function repoPath(a: HubAccount, repo: string): string {
  if (a.provider !== "github") throw new Error("This action is only supported on GitHub.");
  const parts = repo.split("/");
  if (parts.length !== 2 || parts.some((p) => !p || p === "." || p === ".." || /[\x00-\x20\\?#]/.test(p))) throw new Error("Expected owner/repository.");
  return `/repos/${parts.map(enc).join("/")}`;
}
function id(n: number): number {
  if (!Number.isSafeInteger(n) || n < 1) throw new Error("Invalid GitHub identifier.");
  return n;
}
const SHA = /^[0-9a-f]{40}$|^[0-9a-f]{64}$/i;

export function getWorkflowRun(a: HubAccount, repo: string, runId: number): Promise<CiRun> {
  return hubApi<CiRun>(a, "GET", `${repoPath(a, repo)}/actions/runs/${id(runId)}`);
}

export type GithubEnvironment = { id: number; name: string; html_url?: string; protection_rules?: { type: string; wait_timer?: number; reviewers?: { type: string; reviewer: { login?: string; slug?: string; name?: string } }[] }[] };
export async function listEnvironments(a: HubAccount, repo: string): Promise<GithubEnvironment[]> {
  const data = await hubApi<{ environments: GithubEnvironment[] }>(a, "GET", `${repoPath(a, repo)}/environments?per_page=100`);
  return data.environments ?? [];
}

/** Environments the run is actually waiting on, as returned by GitHub (no invented approvals). */
export type PendingDeployment = { environment: { id: number; name: string; html_url?: string }; wait_timer: number; wait_timer_started_at: string | null; current_user_can_approve: boolean; reviewers: { type: string; reviewer: { login?: string; slug?: string; name?: string } }[] };
export function listPendingDeployments(a: HubAccount, repo: string, runId: number): Promise<PendingDeployment[]> {
  return hubApi<PendingDeployment[]>(a, "GET", `${repoPath(a, repo)}/actions/runs/${id(runId)}/pending_deployments`);
}

export type CommitComparison = { status: string; ahead_by: number; behind_by: number; total_commits: number; html_url: string; commits: { sha: string; html_url: string; commit: { message: string } }[]; files?: { filename: string; status: string; additions: number; deletions: number }[] };
export function compareCommits(a: HubAccount, repo: string, base: string, head: string): Promise<CommitComparison> {
  if (!SHA.test(base) || !SHA.test(head)) throw new Error("Compare needs full pinned commit IDs.");
  return hubApi<CommitComparison>(a, "GET", `${repoPath(a, repo)}/compare/${base}...${head}?per_page=100`);
}

/** `"host 403: msg"` (hub_api error shape) → coarse class for honest UI states. */
export function errorKind(error: unknown): "permission" | "missing" | "rate" | "other" {
  const msg = String(error);
  if (/\b(401|403)\b:/.test(msg)) return /rate limit/i.test(msg) ? "rate" : "permission";
  if (/\b404\b:/.test(msg)) return "missing";
  if (/rate limit/i.test(msg)) return "rate";
  return "other";
}

export async function getDefaultBranch(a: HubAccount, repo: string): Promise<string> {
  return (await hubApi<{ default_branch: string }>(a, "GET", repoPath(a, repo))).default_branch;
}
