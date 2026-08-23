export const DEFAULT_BRANCH_CANDIDATES = ['main', 'master', 'develop', 'trunk'] as const;

const FAILED_CONCLUSIONS = new Set(['failure', 'timed_out', 'startup_failure', 'action_required']);

const RUNNING_STATUSES = new Set(['queued', 'in_progress', 'waiting', 'pending', 'requested']);

export type InboxCheckState = 'success' | 'failure' | 'running' | 'unknown';

export type InboxReviewer = {
  login: string;
  avatar: string | null;
};

export type InboxPullRequest = {
  number: number;
  title: string;
  state: string;
  is_draft: boolean;
  author: string;
  author_avatar: string | null;
  source_branch: string;
  target_branch: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  labels: string[];
  reviewers: InboxReviewer[];
  provider: string;
};

export type InboxProviderCapabilities = {
  provider: string;
  label: string;
  host: string;
  can_workflows: boolean;
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

export type InboxPrItem = {
  key: string;
  hostId: string;
  path: string;
  repoName: string;
  number: number;
  title: string;
  author: string;
  authorAvatar: string | null;
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
  hostId: string;
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
  hostId: string;
  path: string;
  repoName: string;
  viewerLogin: string | null;
  prs: InboxPullRequest[];
  runs: InboxWorkflowRun[];
  branches?: string[];
  defaultBranch?: string | null;
};

export type InboxRepoError = {
  hostId: string;
  path: string;
  repoName: string;
  message: string;
};

export type InboxSections = {
  myPrs: InboxPrItem[];
  reviewRequested: InboxPrItem[];
  redRuns: InboxCiItem[];
};

export function normalizeLogin(value: string | null | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase();
}

export function isSameLogin(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  const a = normalizeLogin(left);
  const b = normalizeLogin(right);
  return a.length > 0 && a === b;
}

export function normalizeHost(host: string | null | undefined): string {
  return (host ?? '')
    .trim()
    .toLocaleLowerCase()
    .replace(/^www\./u, '');
}

export function isOpenPr(pr: InboxPullRequest): boolean {
  const state = normalizeLogin(pr.state);
  return state === 'open' || state === 'draft' || state === 'opened';
}

export function stripRemotePrefix(branch: string): string {
  const trimmed = branch
    .trim()
    .replace(/^refs\/heads\//u, '')
    .replace(/^refs\/remotes\//u, '');
  const slash = trimmed.indexOf('/');
  if (slash < 0) {
    return trimmed;
  }
  const head = trimmed.slice(0, slash);
  if (head === 'origin' || head === 'upstream') {
    return trimmed.slice(slash + 1);
  }
  return trimmed;
}

export function resolveDefaultBranch(input: {
  branches?: string[];
  prTargets?: string[];
  defaultBranch?: string | null;
}): string | null {
  const provided = (input.defaultBranch ?? '').trim();
  if (provided) {
    return stripRemotePrefix(provided);
  }

  const counts = new Map<string, number>();
  for (const raw of input.prTargets ?? []) {
    const branch = raw.trim();
    if (!branch) {
      continue;
    }
    counts.set(branch, (counts.get(branch) ?? 0) + 1);
  }
  if (counts.size > 0) {
    const rank = (branch: string) => {
      const index = DEFAULT_BRANCH_CANDIDATES.indexOf(
        branch as (typeof DEFAULT_BRANCH_CANDIDATES)[number]
      );
      return index < 0 ? DEFAULT_BRANCH_CANDIDATES.length : index;
    };
    const ranked = [...counts.entries()].sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      if (rank(left[0]) !== rank(right[0])) {
        return rank(left[0]) - rank(right[0]);
      }
      return left[0].localeCompare(right[0]);
    });
    return ranked[0][0];
  }

  const local = new Set((input.branches ?? []).map(stripRemotePrefix));
  for (const candidate of DEFAULT_BRANCH_CANDIDATES) {
    if (local.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

function runTime(run: InboxWorkflowRun): number {
  const value = Date.parse(run.updated_at || run.created_at);
  return Number.isNaN(value) ? 0 : value;
}

function isNewerRun(candidate: InboxWorkflowRun, current: InboxWorkflowRun): boolean {
  const a = runTime(candidate);
  const b = runTime(current);
  return a > b || (a === b && candidate.run_number > current.run_number);
}

export function latestRunForBranch(
  runs: InboxWorkflowRun[],
  branch: string | null | undefined
): InboxWorkflowRun | null {
  const wanted = (branch ?? '').trim();
  if (!wanted) {
    return null;
  }
  let best: InboxWorkflowRun | null = null;
  for (const run of runs) {
    if ((run.head_branch ?? '').trim() !== wanted) {
      continue;
    }
    if (!best || isNewerRun(run, best)) {
      best = run;
    }
  }
  return best;
}

export function checkStateForRun(run: InboxWorkflowRun | null): InboxCheckState {
  if (!run) {
    return 'unknown';
  }
  const conclusion = normalizeLogin(run.conclusion);
  if (!conclusion) {
    return RUNNING_STATUSES.has(normalizeLogin(run.status)) ? 'running' : 'unknown';
  }
  if (FAILED_CONCLUSIONS.has(conclusion)) {
    return 'failure';
  }
  if (conclusion === 'success') {
    return 'success';
  }
  return 'unknown';
}

export function isFailedRun(run: InboxWorkflowRun): boolean {
  return FAILED_CONCLUSIONS.has(normalizeLogin(run.conclusion));
}

function toPrItem(repo: InboxRepoInput, pr: InboxPullRequest): InboxPrItem {
  return {
    key: `${repo.hostId}:${repo.path}#${pr.number}`,
    hostId: repo.hostId,
    path: repo.path,
    repoName: repo.repoName,
    number: pr.number,
    title: pr.title,
    author: pr.author,
    authorAvatar: pr.author_avatar ?? null,
    isDraft: pr.is_draft || normalizeLogin(pr.state) === 'draft',
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
    for (const pr of mine) {
      items.push(toPrItem(repo, pr));
    }
  }
  return items.sort(byUpdatedDesc);
}

export function selectReviewRequested(repos: InboxRepoInput[]): InboxPrItem[] {
  const items: InboxPrItem[] = [];
  for (const repo of repos) {
    for (const pr of repo.prs) {
      if (!isOpenPr(pr) || pr.reviewers.length === 0) {
        continue;
      }
      if (repo.viewerLogin) {
        if (isSameLogin(pr.author, repo.viewerLogin)) {
          continue;
        }
        if (!pr.reviewers.some((reviewer) => isSameLogin(reviewer.login, repo.viewerLogin))) {
          continue;
        }
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
      defaultBranch: repo.defaultBranch,
    });
    const accepted = (branch: string) =>
      defaultBranch
        ? branch === defaultBranch
        : (DEFAULT_BRANCH_CANDIDATES as readonly string[]).includes(branch);

    const latestByWorkflow = new Map<string, InboxWorkflowRun>();
    for (const run of repo.runs) {
      const branch = (run.head_branch ?? '').trim();
      if (!branch || !accepted(branch)) {
        continue;
      }
      const key = `${run.workflow_id}|${branch}`;
      const current = latestByWorkflow.get(key);
      if (!current || isNewerRun(run, current)) {
        latestByWorkflow.set(key, run);
      }
    }

    for (const run of latestByWorkflow.values()) {
      if (!isFailedRun(run)) {
        continue;
      }
      items.push({
        key: `${repo.hostId}:${repo.path}@${run.id}`,
        hostId: repo.hostId,
        path: repo.path,
        repoName: repo.repoName,
        runId: run.id,
        name: run.name,
        branch: (run.head_branch ?? '').trim(),
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

export function inboxBadgeCount(sections: InboxSections, pendingApprovals = 0): number {
  return sections.reviewRequested.length + sections.redRuns.length + pendingApprovals;
}

export function inboxTotalCount(sections: InboxSections, pendingApprovals = 0): number {
  return sections.myPrs.length + inboxBadgeCount(sections, pendingApprovals);
}
