import type {
  BisectStatus,
  Branch,
  CherryPickState,
  Commit,
  MergeState,
  PullRequest,
  StashEntry,
  StatusEntry,
  UpstreamSyncCounts,
  WorktreeEntry,
} from "@/lib/repo-store";

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
  const items: (RecentActivityItem & { ts: number })[] = [];
  for (const c of args.commits ?? []) {
    const dt = parseCommitDate(c.date);
    if (!dt) continue;
    items.push({
      id: `c-${c.hash}`,
      kind: "commit",
      title: c.subject || c.short_hash,
      subtitle: c.author,
      date: dt.toISOString(),
      ts: dt.getTime(),
    });
  }
  for (const s of args.stashes ?? []) {
    const dt = parseCommitDate(s.date);
    if (!dt) continue;
    items.push({
      id: `s-${s.refname}`,
      kind: "stash",
      title: s.subject || s.message || s.refname,
      subtitle: s.branch,
      date: dt.toISOString(),
      ts: dt.getTime(),
    });
  }
  for (const pr of args.prs ?? []) {
    const dt = parseCommitDate(pr.updated_at || pr.created_at);
    if (!dt) continue;
    items.push({
      id: `p-${pr.number}`,
      kind: "pr",
      title: `#${pr.number} ${pr.title}`,
      subtitle: pr.author,
      date: dt.toISOString(),
      ts: dt.getTime(),
    });
  }
  return items
    .sort((a, b) => b.ts - a.ts)
    .slice(0, args.limit ?? 10)
    .map(({ ts: _ts, ...rest }) => rest);
}

export type HealthSeverity = "ok" | "warn" | "error";

export type HealthItem = {
  key: string;
  severity: HealthSeverity;
  detail?: string | number;
};

export function selectRepoHealth(args: {
  status?: readonly StatusEntry[];
  upstreamSync?: UpstreamSyncCounts;
  hasUpstream?: boolean;
  cherryPick?: CherryPickState;
  mergeState?: MergeState;
  bisect?: BisectStatus;
  stashes?: readonly StashEntry[];
  worktrees?: readonly WorktreeEntry[];
}): HealthItem[] {
  const items: HealthItem[] = [];
  const dirty = args.status?.length ?? 0;
  items.push({
    key: "workingCopy",
    severity: dirty === 0 ? "ok" : "warn",
    detail: dirty,
  });
  if (args.hasUpstream === false) {
    items.push({ key: "upstream", severity: "warn" });
  } else {
    const ahead = args.upstreamSync?.ahead ?? 0;
    const behind = args.upstreamSync?.behind ?? 0;
    items.push({
      key: "upstream",
      severity: ahead + behind === 0 ? "ok" : behind > 0 ? "warn" : "ok",
      detail: `${ahead}/${behind}`,
    });
  }
  const conflicted =
    (args.cherryPick?.conflicted_paths?.length ?? 0) +
    (args.mergeState?.conflicted_paths?.length ?? 0);
  items.push({
    key: "conflicts",
    severity: conflicted === 0 ? "ok" : "error",
    detail: conflicted,
  });
  items.push({
    key: "bisect",
    severity: args.bisect?.active ? "warn" : "ok",
  });
  items.push({
    key: "stashes",
    severity: (args.stashes?.length ?? 0) === 0 ? "ok" : "warn",
    detail: args.stashes?.length ?? 0,
  });
  items.push({
    key: "worktrees",
    severity: "ok",
    detail: args.worktrees?.length ?? 0,
  });
  return items;
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
