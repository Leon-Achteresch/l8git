import type { AgentOverviewEntry } from "@/lib/agents/overview";

export interface DayBucket {
  key: string;
  date: Date;
  label: string;
  count: number;
  tokens: number;
  costUsd: number;
}

export interface HeatCell {
  key: string;
  dateLabel: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${trim(n / 1_000_000_000)}B`;
  if (abs >= 1_000_000) return `${trim(n / 1_000_000)}M`;
  if (abs >= 1_000) return `${trim(n / 1_000)}K`;
  return `${Math.round(n)}`;
}

function trim(n: number): string {
  return n >= 100 ? `${Math.round(n)}` : n >= 10 ? n.toFixed(1).replace(/\.0$/, "") : n.toFixed(1).replace(/\.0$/, "");
}

export function buildDayBuckets(entries: AgentOverviewEntry[], days: number, now = new Date()): DayBucket[] {
  const today = startOfDay(now);
  const buckets = new Map<string, DayBucket>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const key = dayKey(date);
    buckets.set(key, {
      key,
      date,
      label: date.toLocaleDateString(undefined, { day: "2-digit", month: "short" }),
      count: 0,
      tokens: 0,
      costUsd: 0,
    });
  }
  for (const entry of entries) {
    const d = startOfDay(new Date(entry.updatedAt * 1000));
    const key = dayKey(d);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.count += 1;
    bucket.tokens += entry.tokens ?? 0;
    bucket.costUsd += entry.costUsd ?? 0;
  }
  return [...buckets.values()];
}

export function levelFor(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || max <= 0) return 0;
  const ratio = count / max;
  if (ratio >= 0.8) return 4;
  if (ratio >= 0.55) return 3;
  if (ratio >= 0.3) return 2;
  return 1;
}

/** GitHub-style columns (weeks) of 7 cells, oldest week first. */
export function buildHeatmap(entries: AgentOverviewEntry[], weeks: number, now = new Date()): HeatCell[][] {
  const days = weeks * 7;
  const buckets = buildDayBuckets(entries, days, now);
  const max = buckets.reduce((m, b) => Math.max(m, b.count), 0);
  const columns: HeatCell[][] = [];
  for (let w = 0; w < weeks; w += 1) {
    const col: HeatCell[] = [];
    for (let d = 0; d < 7; d += 1) {
      const bucket = buckets[w * 7 + d];
      col.push({
        key: bucket.key,
        dateLabel: bucket.label,
        count: bucket.count,
        level: levelFor(bucket.count, max),
      });
    }
    columns.push(col);
  }
  return columns;
}

export function topStreakDays(entries: AgentOverviewEntry[]): number {
  if (!entries.length) return 0;
  const days = new Set<string>();
  for (const entry of entries) {
    days.add(dayKey(startOfDay(new Date(entry.updatedAt * 1000))));
  }
  const sorted = [...days].sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = new Date(`${sorted[i - 1]}T00:00:00`);
    const cur = new Date(`${sorted[i]}T00:00:00`);
    const diff = Math.round((cur.getTime() - prev.getTime()) / 86_400_000);
    if (diff === 1) {
      run += 1;
      best = Math.max(best, run);
    } else if (diff > 1) {
      run = 1;
    }
  }
  return best;
}

export function longestTaskLabel(entries: AgentOverviewEntry[]): string {
  if (!entries.length) return "—";
  const now = Date.now() / 1000;
  const oldest = entries.reduce((m, e) => Math.min(m, e.updatedAt), now);
  const hours = Math.max(1, Math.round((now - oldest) / 3600));
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest > 0 ? `${days}d ${rest}h` : `${days}d`;
}

export function monthBuckets(entries: AgentOverviewEntry[], year: number, month: number): DayBucket[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const buckets: DayBucket[] = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    buckets.push({
      key: dayKey(date),
      date,
      label: `${day}`,
      count: 0,
      tokens: 0,
      costUsd: 0,
    });
  }
  const map = new Map(buckets.map((b) => [b.key, b]));
  for (const entry of entries) {
    const d = new Date(entry.updatedAt * 1000);
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    const bucket = map.get(dayKey(startOfDay(d)));
    if (!bucket) continue;
    bucket.count += 1;
    bucket.tokens += entry.tokens ?? 0;
    bucket.costUsd += entry.costUsd ?? 0;
  }
  return buckets;
}

/** Smooth-ish sparkline points with sharp joins (BoardUI tokens chart). */
export function tokensSeries(entries: AgentOverviewEntry[], days = 30, now = new Date()): number[] {
  return buildDayBuckets(entries, days, now).map((b) => b.tokens);
}

export function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
