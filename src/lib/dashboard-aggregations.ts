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

export type DayBucket = { date: string; commits: number };

export function selectCommitsByDay(
  commits: readonly Commit[] | undefined,
  days: number,
): DayBucket[] {
  const buckets: DayBucket[] = [];
  const today = startOfUtcDay(new Date());
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY_MS);
    buckets.push({ date: d.toISOString().slice(0, 10), commits: 0 });
  }
  if (!commits || commits.length === 0) return buckets;
  const indexByDate = new Map(buckets.map((b, idx) => [b.date, idx]));
  const cutoff = today.getTime() - (days - 1) * DAY_MS;
  for (const c of commits) {
    const dt = parseCommitDate(c.date);
    if (!dt) continue;
    const dayStart = startOfUtcDay(dt).getTime();
    if (dayStart < cutoff) continue;
    const key = new Date(dayStart).toISOString().slice(0, 10);
    const idx = indexByDate.get(key);
    if (idx !== undefined) buckets[idx].commits += 1;
  }
  return buckets;
}

export type BranchBuckets = {
  total: number;
  active: number;
  stale: number;
  remote: number;
};

export function selectBranchBuckets(
  branches: readonly Branch[] | undefined,
  commits: readonly Commit[] | undefined,
  staleDays = 30,
): BranchBuckets {
  if (!branches || branches.length === 0) {
    return { total: 0, active: 0, stale: 0, remote: 0 };
  }
  const tipDate = new Map<string, number>();
  for (const c of commits ?? []) {
    const dt = parseCommitDate(c.date);
    if (dt) tipDate.set(c.hash, dt.getTime());
  }
  const cutoff = Date.now() - staleDays * DAY_MS;
  let active = 0;
  let stale = 0;
  let remote = 0;
  for (const b of branches) {
    if (b.is_remote) {
      remote += 1;
      continue;
    }
    const ts = tipDate.get(b.tip);
    if (ts === undefined) {
      stale += 1;
    } else if (ts >= cutoff) {
      active += 1;
    } else {
      stale += 1;
    }
  }
  return { total: branches.length, active, stale, remote };
}

export type ContributorBucket = {
  name: string;
  email: string;
  commits: number;
  percent: number;
};

export function selectTopContributors(
  commits: readonly Commit[] | undefined,
  limit = 6,
): ContributorBucket[] {
  if (!commits || commits.length === 0) return [];
  const map = new Map<string, { name: string; email: string; commits: number }>();
  for (const c of commits) {
    const key = (c.email || c.author || "").toLowerCase();
    if (!key) continue;
    const existing = map.get(key);
    if (existing) existing.commits += 1;
    else
      map.set(key, {
        name: c.author || c.email || key,
        email: c.email || "",
        commits: 1,
      });
  }
  const total = commits.length;
  return Array.from(map.values())
    .sort((a, b) => b.commits - a.commits)
    .slice(0, limit)
    .map((e) => ({ ...e, percent: total > 0 ? (e.commits / total) * 100 : 0 }));
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

export type WeeklyPrPoint = { weekStart: string; count: number };

export function selectOpenPrTrend(
  prs: readonly PullRequest[] | undefined,
  weeks = 8,
): WeeklyPrPoint[] {
  const result: WeeklyPrPoint[] = [];
  const today = startOfUtcDay(new Date());
  const monday = new Date(today);
  const dow = (monday.getUTCDay() + 6) % 7;
  monday.setUTCDate(monday.getUTCDate() - dow);
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(monday.getTime() - i * 7 * DAY_MS);
    result.push({ weekStart: start.toISOString().slice(0, 10), count: 0 });
  }
  if (!prs || prs.length === 0) return result;
  for (const pr of prs) {
    if (pr.state !== "open") continue;
    const created = parseCommitDate(pr.created_at);
    if (!created) continue;
    for (const point of result) {
      const ts = new Date(point.weekStart + "T00:00:00Z").getTime();
      if (created.getTime() <= ts + 7 * DAY_MS - 1) {
        point.count += 1;
      }
    }
  }
  return result;
}

export type RecentActivityItem = {
  id: string;
  kind: "commit" | "stash" | "pr" | "branch";
  title: string;
  subtitle?: string;
  date: string;
};

export function selectRecentActivity(args: {
  commits?: readonly Commit[];
  stashes?: readonly StashEntry[];
  prs?: readonly PullRequest[];
  branches?: readonly Branch[];
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
