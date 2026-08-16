import type { PullRequest } from "@/lib/repo-store";

export const GIT_ACCOUNTS_STORAGE_KEY = "l8git.git-accounts.v2";

export const DEFAULT_BRANCH_CANDIDATES = ["main", "master", "develop", "trunk"] as const;

const FAILED_CONCLUSIONS = new Set([
  "failure",
  "timed_out",
  "startup_failure",
  "action_required",
]);

const RUNNING_STATUSES = new Set([
  "queued",
  "in_progress",
  "waiting",
  "pending",
  "requested",
]);

export type StoredGitAccount = {
  host: string;
  username: string | null;
};

export type InboxWorkflowRun = {
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
};

export type InboxCheckState = "success" | "failure" | "running" | "unknown";

export type InboxPrItem = {
  key: string;
  path: string;
  repoName: string;
  number: number;
  title: string;
  author: string;
  isDraft: boolean;
  sourceBranch: string;
  targetBranch: string;
  htmlUrl: string;
  updatedAt: string;
  reviewers: string[];
  provider: string;
  checks: InboxCheckState;
};

export type InboxCiItem = {
  key: string;
  path: string;
  repoName: string;
  runId: number;
  name: string;
  branch: string;
  conclusion: string;
  event: string;
  runNumber: number;
  htmlUrl: string;
  updatedAt: string;
};

export type InboxRepoInput = {
  path: string;
  repoName: string;
  viewerLogin: string | null;
  prs: PullRequest[];
  runs: InboxWorkflowRun[];
  branches?: string[];
};

export type InboxSections = {
  myPrs: InboxPrItem[];
  reviewRequested: InboxPrItem[];
  redRuns: InboxCiItem[];
};

export function repoNameFromPath(path: string): string {
  return path.split(/[\\/]/u).filter(Boolean).pop() ?? path;
}

export function normalizeLogin(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase();
}

export function isSameLogin(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = normalizeLogin(left);
  const b = normalizeLogin(right);
  return a.length > 0 && a === b;
}

export function normalizeHost(host: string | null | undefined): string {
  return (host ?? "").trim().toLocaleLowerCase().replace(/^www\./u, "");
}

export function parseStoredGitAccounts(raw: string | null): StoredGitAccount[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (entry): entry is { host: string; username?: unknown } =>
          typeof entry === "object" && entry !== null && typeof (entry as { host?: unknown }).host === "string",
      )
      .map((entry) => ({
        host: entry.host,
        username: typeof entry.username === "string" && entry.username.trim() ? entry.username.trim() : null,
      }));
  } catch {
    return [];
  }
}

export function viewerLoginForHost(accounts: StoredGitAccount[], host: string | null | undefined): string | null {
  const wanted = normalizeHost(host);
  if (!wanted) return null;
  const hit = accounts.find((account) => normalizeHost(account.host) === wanted);
  return hit?.username ?? null;
}

export function isOpenPr(pr: PullRequest): boolean {
  const state = normalizeLogin(pr.state);
  return state === "open" || state === "draft" || state === "opened";
}

export function stripRemotePrefix(branch: string): string {
  const trimmed = branch.trim().replace(/^refs\/heads\//u, "").replace(/^refs\/remotes\//u, "");
  const slash = trimmed.indexOf("/");
  if (slash < 0) return trimmed;
  const head = trimmed.slice(0, slash);
  if (head === "origin" || head === "upstream") return trimmed.slice(slash + 1);
  return trimmed;
}

export function resolveDefaultBranch(input: {
  branches?: string[];
  prTargets?: string[];
}): string | null {
  const counts = new Map<string, number>();
  for (const raw of input.prTargets ?? []) {
    const branch = raw.trim();
    if (!branch) continue;
    counts.set(branch, (counts.get(branch) ?? 0) + 1);
  }
  if (counts.size > 0) {
    const ranked = [...counts.entries()].sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      const li = DEFAULT_BRANCH_CANDIDATES.indexOf(left[0] as (typeof DEFAULT_BRANCH_CANDIDATES)[number]);
      const ri = DEFAULT_BRANCH_CANDIDATES.indexOf(right[0] as (typeof DEFAULT_BRANCH_CANDIDATES)[number]);
      const lp = li < 0 ? DEFAULT_BRANCH_CANDIDATES.length : li;
      const rp = ri < 0 ? DEFAULT_BRANCH_CANDIDATES.length : ri;
      if (lp !== rp) return lp - rp;
      return left[0].localeCompare(right[0]);
    });
    return ranked[0][0];
  }
  const local = new Set((input.branches ?? []).map(stripRemotePrefix));
  for (const candidate of DEFAULT_BRANCH_CANDIDATES) {
    if (local.has(candidate)) return candidate;
  }
  return null;
}

function runTime(run: InboxWorkflowRun): number {
  const value = Date.parse(run.updated_at || run.created_at);
  return Number.isNaN(value) ? 0 : value;
}

export function latestRunForBranch(
  runs: InboxWorkflowRun[],
  branch: string | null | undefined,
): InboxWorkflowRun | null {
  const wanted = (branch ?? "").trim();
  if (!wanted) return null;
  let best: InboxWorkflowRun | null = null;
  for (const run of runs) {
    if ((run.head_branch ?? "").trim() !== wanted) continue;
    if (!best || runTime(run) > runTime(best) || (runTime(run) === runTime(best) && run.run_number > best.run_number)) {
      best = run;
    }
  }
  return best;
}

export function checkStateForRun(run: InboxWorkflowRun | null): InboxCheckState {
  if (!run) return "unknown";
  const conclusion = normalizeLogin(run.conclusion);
  if (!conclusion) {
    return RUNNING_STATUSES.has(normalizeLogin(run.status)) ? "running" : "unknown";
  }
  if (FAILED_CONCLUSIONS.has(conclusion)) return "failure";
  if (conclusion === "success") return "success";
  return "unknown";
}

export function isFailedRun(run: InboxWorkflowRun): boolean {
  return FAILED_CONCLUSIONS.has(normalizeLogin(run.conclusion));
}

function toPrItem(repo: InboxRepoInput, pr: PullRequest): InboxPrItem {
  return {
    key: `${repo.path}#${pr.number}`,
    path: repo.path,
    repoName: repo.repoName,
    number: pr.number,
    title: pr.title,
    author: pr.author,
    isDraft: pr.is_draft || normalizeLogin(pr.state) === "draft",
    sourceBranch: pr.source_branch,
    targetBranch: pr.target_branch,
    htmlUrl: pr.html_url,
    updatedAt: pr.updated_at || pr.created_at,
    reviewers: pr.reviewers.map((reviewer) => reviewer.login).filter(Boolean),
    provider: pr.provider,
    checks: checkStateForRun(latestRunForBranch(repo.runs, pr.source_branch)),
  };
}

function byUpdatedDesc(left: { updatedAt: string }, right: { updatedAt: string }): number {
  const a = Date.parse(right.updatedAt);
  const b = Date.parse(left.updatedAt);
  return (Number.isNaN(a) ? 0 : a) - (Number.isNaN(b) ? 0 : b);
}

export function selectMyPrs(repos: InboxRepoInput[]): InboxPrItem[] {
  const items: InboxPrItem[] = [];
  for (const repo of repos) {
    const open = repo.prs.filter(isOpenPr);
    const mine = repo.viewerLogin
      ? open.filter((pr) => isSameLogin(pr.author, repo.viewerLogin))
      : open;
    for (const pr of mine) items.push(toPrItem(repo, pr));
  }
  return items.sort(byUpdatedDesc);
}

export function selectReviewRequested(repos: InboxRepoInput[]): InboxPrItem[] {
  const items: InboxPrItem[] = [];
  for (const repo of repos) {
    for (const pr of repo.prs) {
      if (!isOpenPr(pr)) continue;
      if (pr.reviewers.length === 0) continue;
      if (repo.viewerLogin) {
        if (isSameLogin(pr.author, repo.viewerLogin)) continue;
        if (!pr.reviewers.some((reviewer) => isSameLogin(reviewer.login, repo.viewerLogin))) continue;
      }
      items.push(toPrItem(repo, pr));
    }
  }
  return items.sort(byUpdatedDesc);
}

export function selectRedRuns(repos: InboxRepoInput[]): InboxCiItem[] {
  const items: InboxCiItem[] = [];
  for (const repo of repos) {
    const defaultBranch = resolveDefaultBranch({
      branches: repo.branches,
      prTargets: repo.prs.filter(isOpenPr).map((pr) => pr.target_branch),
    });
    const accepted = (branch: string) =>
      defaultBranch
        ? branch === defaultBranch
        : (DEFAULT_BRANCH_CANDIDATES as readonly string[]).includes(branch);

    const latestByWorkflow = new Map<string, InboxWorkflowRun>();
    for (const run of repo.runs) {
      const branch = (run.head_branch ?? "").trim();
      if (!branch || !accepted(branch)) continue;
      const key = `${run.workflow_id}|${branch}`;
      const current = latestByWorkflow.get(key);
      if (!current || runTime(run) > runTime(current) || (runTime(run) === runTime(current) && run.run_number > current.run_number)) {
        latestByWorkflow.set(key, run);
      }
    }

    for (const run of latestByWorkflow.values()) {
      if (!isFailedRun(run)) continue;
      items.push({
        key: `${repo.path}@${run.id}`,
        path: repo.path,
        repoName: repo.repoName,
        runId: run.id,
        name: run.name,
        branch: (run.head_branch ?? "").trim(),
        conclusion: normalizeLogin(run.conclusion),
        event: run.event,
        runNumber: run.run_number,
        htmlUrl: run.html_url,
        updatedAt: run.updated_at || run.created_at,
      });
    }
  }
  return items.sort(byUpdatedDesc);
}

export function buildInboxSections(repos: InboxRepoInput[]): InboxSections {
  return {
    myPrs: selectMyPrs(repos),
    reviewRequested: selectReviewRequested(repos),
    redRuns: selectRedRuns(repos),
  };
}

export function emptyInboxSections(): InboxSections {
  return { myPrs: [], reviewRequested: [], redRuns: [] };
}

export function inboxBadgeCount(sections: InboxSections): number {
  return sections.reviewRequested.length + sections.redRuns.length;
}
