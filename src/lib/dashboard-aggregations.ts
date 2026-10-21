import type {
  BisectStatus,
  Branch,
  CherryPickState,
  Commit,
  MergeState,
  PullRequest,
  RebaseStatus,
  StashEntry,
  StatusEntry,
  UpstreamSyncCounts,
  WorktreeEntry,
} from "@/lib/repo-store";

import { isConflictedStatus } from "@/lib/workflow-help";

const DAY_MS = 86_400_000;

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function parseCommitDate(value: string): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  const direct = new Date(trimmed);
  if (!Number.isNaN(direct.getTime())) return direct;
  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return new Date(asNumber < 1e12 ? asNumber * 1000 : asNumber);
  }
  return null;
}

export type RawActivityBucket = {
  bucket: string;
  commits: number;
  insertions: number;
  deletions: number;
};

export type ActivityDay = {
  date: string;
  commits: number;
  insertions: number;
  deletions: number;
};

export function buildDailySeries(
  buckets: readonly RawActivityBucket[] | undefined,
  days: number,
): ActivityDay[] {
  const byDate = new Map((buckets ?? []).map((b) => [b.bucket, b]));
  const today = startOfUtcDay(new Date());
  const series: ActivityDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today.getTime() - i * DAY_MS).toISOString().slice(0, 10);
    const b = byDate.get(date);
    series.push({
      date,
      commits: b?.commits ?? 0,
      insertions: b?.insertions ?? 0,
      deletions: b?.deletions ?? 0,
    });
  }
  return series;
}

export type ActivityTotals = {
  commits: number;
  insertions: number;
  deletions: number;
};

export function sumActivity(days: readonly ActivityDay[]): ActivityTotals {
  return days.reduce(
    (acc, d) => ({
      commits: acc.commits + d.commits,
      insertions: acc.insertions + d.insertions,
      deletions: acc.deletions + d.deletions,
    }),
    { commits: 0, insertions: 0, deletions: 0 },
  );
}

export type ActivityGrouping = "day" | "week" | "month";

function groupKey(date: string, grouping: ActivityGrouping): string {
  if (grouping === "day") return date;
  const d = new Date(date + "T00:00:00Z");
  if (grouping === "month") {
    return `${date.slice(0, 7)}-01`;
  }
  const dow = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - dow * DAY_MS).toISOString().slice(0, 10);
}

export function groupActivity(
  days: readonly ActivityDay[],
  grouping: ActivityGrouping,
): ActivityDay[] {
  const result: ActivityDay[] = [];
  const indexByKey = new Map<string, number>();
  for (const d of days) {
    const key = groupKey(d.date, grouping);
    const idx = indexByKey.get(key);
    if (idx === undefined) {
      indexByKey.set(key, result.length);
      result.push({ ...d, date: key });
    } else {
      result[idx].commits += d.commits;
      result[idx].insertions += d.insertions;
      result[idx].deletions += d.deletions;
    }
  }
  return result;
}

export type StreakSummary = {
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
  busiest: ActivityDay | null;
};

export function selectStreaks(days: readonly ActivityDay[]): StreakSummary {
  let activeDays = 0;
  let longest = 0;
  let run = 0;
  let busiest: ActivityDay | null = null;
  for (const d of days) {
    if (d.commits > 0) {
      activeDays += 1;
      run += 1;
      longest = Math.max(longest, run);
      if (!busiest || d.commits > busiest.commits) busiest = d;
    } else {
      run = 0;
    }
  }
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].commits > 0) {
      current += 1;
    } else if (i === days.length - 1) {
      continue;
    } else {
      break;
    }
  }
  return { activeDays, currentStreak: current, longestStreak: longest, busiest };
}

export type WorkingCopySummary = {
  total: number;
  staged: number;
  unstaged: number;
  untracked: number;
  conflicted: number;
};

export function selectWorkingCopy(
  entries: readonly StatusEntry[] | undefined,
): WorkingCopySummary {
  const summary: WorkingCopySummary = {
    total: 0,
    staged: 0,
    unstaged: 0,
    untracked: 0,
    conflicted: 0,
  };
  if (!entries) return summary;
  for (const e of entries) {
    summary.total += 1;
    if (e.untracked) summary.untracked += 1;
    if (e.staged) summary.staged += 1;
    if (e.unstaged) summary.unstaged += 1;
    if (e.index_status === "U" || e.worktree_status === "U") summary.conflicted += 1;
  }
  return summary;
}

export type BranchScopes = {
  total: number;
  local: number;
  remote: number;
};

export function selectBranchScopes(branches: readonly Branch[] | undefined): BranchScopes {
  let local = 0;
  let remote = 0;
  for (const b of branches ?? []) {
    if (b.is_remote) remote += 1;
    else local += 1;
  }
  return { total: local + remote, local, remote };
}

export type BranchActivityEntry = {
  name: string;
  is_remote: boolean;
  last_commit_at: string;
};

export type BranchActivitySummary = {
  total: number;
  active: number;
  stale: number;
};

export const BRANCH_STALE_DAYS = 30;

export function selectBranchActivity(
  entries: readonly BranchActivityEntry[] | undefined,
  staleDays: number = BRANCH_STALE_DAYS,
  now: number = Date.now(),
): BranchActivitySummary {
  let active = 0;
  let stale = 0;
  const cutoff = now - staleDays * DAY_MS;
  for (const e of entries ?? []) {
    const dt = parseCommitDate(e.last_commit_at);
    if (dt && dt.getTime() >= cutoff) active += 1;
    else stale += 1;
  }
  return { total: active + stale, active, stale };
}

export type RecentActivityItem = {
  id: string;
  kind: "commit" | "stash" | "pr";
  title: string;
  subtitle?: string;
  date: string;
};

export function selectRecentActivity(args: {
  commits?: readonly Commit[];
  stashes?: readonly StashEntry[];
  prs?: readonly PullRequest[];
  limit?: number;
}): RecentActivityItem[] {
  // Keeps only the newest `limit` entries while scanning: repos have tens of thousands of
  // commits, and building and sorting an item for each one blocked the dashboard's first frame.
  const limit = args.limit ?? 10;
  if (limit <= 0) return [];
  const top: { ts: number; dt: Date; make: (date: string) => RecentActivityItem }[] = [];
  const consider = (value: string, make: (date: string) => RecentActivityItem) => {
    const dt = parseCommitDate(value);
    if (!dt) return;
    const ts = dt.getTime();
    if (top.length === limit && !(ts > top[top.length - 1].ts)) return;
    // Equal timestamps stay in input order, like a stable sort.
    let i = top.length;
    while (i > 0 && top[i - 1].ts < ts) i--;
    top.splice(i, 0, { ts, dt, make });
    if (top.length > limit) top.pop();
  };
  for (const c of args.commits ?? []) {
    consider(c.date, (date) => ({ id: `c-${c.hash}`, kind: "commit", title: c.subject || c.short_hash, subtitle: c.author, date }));
  }
  for (const s of args.stashes ?? []) {
    consider(s.date, (date) => ({ id: `s-${s.refname}`, kind: "stash", title: s.subject || s.message || s.refname, subtitle: s.branch, date }));
  }
  for (const pr of args.prs ?? []) {
    consider(pr.updated_at || pr.created_at, (date) => ({ id: `p-${pr.number}`, kind: "pr", title: `#${pr.number} ${pr.title}`, subtitle: pr.author, date }));
  }
  return top.map(({ dt, make }) => make(dt.toISOString()));
}

export type HealthSeverity = "ok" | "warn" | "error" | "unknown";
export type HealthKey = "workingCopy" | "upstream" | "conflicts" | "bisect" | "stashes" | "worktrees";
export type HealthSource = "status" | "mergeState" | "cherryPick" | "rebase" | "bisect" | "stashes" | "worktrees";
export type HealthReadState = { loading: boolean; checked: boolean; error: string | null };
export type HealthReadStates = Partial<Record<HealthSource, HealthReadState>>;
export type RepoHealthData = {
  status?: readonly StatusEntry[];
  upstreamSync?: UpstreamSyncCounts;
  hasUpstream?: boolean;
  cherryPick?: CherryPickState;
  mergeState?: MergeState;
  rebase?: RebaseStatus;
  bisect?: BisectStatus;
  stashes?: readonly StashEntry[];
  worktrees?: readonly WorktreeEntry[];
};
export type HealthItem = {
  key: HealthKey;
  severity: HealthSeverity;
  messageKey: string;
  values?: Record<string, number>;
  availability: "ready" | "unknown" | "loading" | "error" | "lastKnown";
  refreshing: boolean;
  error: string | null;
  guide?: "first-commit" | "sync-branch" | "resolve-conflicts" | "stash-work" | "parallel-work";
  view?: "history";
};

export function selectRepoHealth(args: RepoHealthData & { sources?: HealthReadStates }): HealthItem[] {
  const readState = (sources: HealthSource[], known: boolean) => {
    const reads = sources.map(source => args.sources?.[source]);
    const refreshing = reads.some(read => read?.loading);
    const errors = [...new Set(reads.flatMap(read => read?.error ? [read.error] : []))];
    const error = errors.length ? errors.join(" · ") : null;
    const unchecked = reads.some(read => read && !read.checked);
    const availability: HealthItem["availability"] = known
      ? refreshing || error || unchecked ? "lastKnown" : "ready"
      : refreshing ? "loading" : error ? "error" : "unknown";
    return { availability, refreshing, error };
  };
  const item = (key: HealthKey, sources: HealthSource[], known: boolean, severity: HealthSeverity,
    message: string, values?: Record<string, number>): HealthItem => ({
    key, severity: known ? severity : "unknown", messageKey: `dashboard.health.${key}.${message}`, values,
    ...readState(sources, known),
  });
  const statusConflicts = args.status?.filter(entry => isConflictedStatus(entry.index_status, entry.worktree_status));
  const changed = new Set(args.status?.map(entry => entry.path)).size;
  const workingCopy = item("workingCopy", ["status"], args.status !== undefined,
    statusConflicts?.length ? "error" : changed ? "warn" : "ok", changed ? "count" : "ok", { count: changed });
  workingCopy.guide = statusConflicts?.length ? "resolve-conflicts" : "first-commit";

  const countsKnown = args.hasUpstream === true && args.upstreamSync !== undefined &&
    [args.upstreamSync.ahead, args.upstreamSync.behind].every(value => Number.isSafeInteger(value) && value >= 0);
  const ahead = countsKnown ? args.upstreamSync!.ahead : 0;
  const behind = countsKnown ? args.upstreamSync!.behind : 0;
  const upstream = item("upstream", ["status"], args.hasUpstream === false || countsKnown,
    args.hasUpstream === false || ahead || behind ? "warn" : "ok",
    args.hasUpstream === false ? "noUpstream" : ahead && behind ? "diverged" : ahead ? "ahead" : behind ? "behind" : "ok",
    ahead && behind ? { ahead, behind } : { count: ahead || behind });
  upstream.guide = "sync-branch";

  const conflictPaths = new Set([
    ...(statusConflicts?.map(entry => entry.path) ?? []),
    ...(args.mergeState?.conflicted_paths ?? []),
    ...(args.cherryPick?.conflicted_paths ?? []),
    ...(args.rebase?.conflicted_paths ?? []),
  ]);
  const conflictsKnown = [args.status, args.mergeState, args.cherryPick, args.rebase].every(value => value !== undefined);
  const conflicts = item("conflicts", ["status", "mergeState", "cherryPick", "rebase"], conflictsKnown,
    conflictPaths.size ? "error" : "ok", conflictPaths.size ? conflictsKnown ? "count" : "partial" : "ok", { count: conflictPaths.size });
  // A known conflict is actionable even when another source is unavailable.
  if (conflictPaths.size) conflicts.severity = "error";
  conflicts.guide = "resolve-conflicts";

  const bisect = item("bisect", ["bisect"], args.bisect !== undefined, args.bisect?.active ? "warn" : "ok", args.bisect?.active ? "warn" : "ok");
  bisect.view = "history";
  const stashes = item("stashes", ["stashes"], args.stashes !== undefined, args.stashes?.length ? "warn" : "ok",
    args.stashes?.length ? "count" : "ok", { count: args.stashes?.length ?? 0 });
  stashes.guide = "stash-work";
  const extraWorktrees = args.worktrees?.filter(entry => !entry.is_main).length ?? 0;
  const worktrees = item("worktrees", ["worktrees"], args.worktrees !== undefined, "ok",
    extraWorktrees ? "count" : "ok", { count: extraWorktrees });
  worktrees.guide = "parallel-work";
  return [workingCopy, upstream, conflicts, bisect, stashes, worktrees];
}

export function formatRelativeTime(date: Date | string | number | null | undefined, locale?: string): string {
  if (!date) return "";
  const dt = date instanceof Date ? date : parseCommitDate(String(date));
  if (!dt) return "";
  const diffSec = (Date.now() - dt.getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const ranges: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
    ["second", 1],
  ];
  for (const [unit, secs] of ranges) {
    if (Math.abs(diffSec) >= secs || unit === "second") {
      return rtf.format(-Math.round(diffSec / secs), unit);
    }
  }
  return "";
}
