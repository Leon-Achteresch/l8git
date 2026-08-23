export const DAY_MS = 86_400_000;

export type ActivityGrouping = 'day' | 'week' | 'month';

export type RangeKey = '14d' | '1m' | '3m' | '6m' | '1y';

export const RANGE_KEYS: readonly RangeKey[] = ['14d', '1m', '3m', '6m', '1y'];

export const RANGES: Record<RangeKey, { days: number; grouping: ActivityGrouping; long: string }> =
  {
    '14d': { days: 14, grouping: 'day', long: 'last 14 days' },
    '1m': { days: 30, grouping: 'day', long: 'last 30 days' },
    '3m': { days: 91, grouping: 'week', long: 'last 3 months' },
    '6m': { days: 182, grouping: 'week', long: 'last 6 months' },
    '1y': { days: 364, grouping: 'month', long: 'last 12 months' },
  };

export interface ActivityBucketRow {
  bucket: string;
  commits: number;
  insertions: number;
  deletions: number;
}

export interface ActivityPoint {
  date: string;
  commits: number;
  insertions: number;
  deletions: number;
}

export interface ActivityTotals {
  commits: number;
  insertions: number;
  deletions: number;
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export function utcDayStart(time: number): number {
  return Math.floor(time / DAY_MS) * DAY_MS;
}

export function isoDate(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

export function parseIsoDate(date: string): number {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function buildDailySeries(
  rows: readonly ActivityBucketRow[] | undefined,
  days: number,
  now: number = Date.now()
): ActivityPoint[] {
  const byDate = new Map<string, ActivityBucketRow>();
  for (const row of rows ?? []) {
    byDate.set(row.bucket, row);
  }
  const today = utcDayStart(now);
  const series: ActivityPoint[] = [];
  for (let index = days - 1; index >= 0; index -= 1) {
    const date = isoDate(today - index * DAY_MS);
    const row = byDate.get(date);
    series.push({
      date,
      commits: row?.commits ?? 0,
      insertions: row?.insertions ?? 0,
      deletions: row?.deletions ?? 0,
    });
  }
  return series;
}

function weekStart(time: number): number {
  const day = Math.floor(time / DAY_MS) % 7;
  return time - ((day + 3) % 7) * DAY_MS;
}

function monthStart(time: number): number {
  const date = new Date(time);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

export function groupActivity(
  points: readonly ActivityPoint[],
  grouping: ActivityGrouping
): ActivityPoint[] {
  if (grouping === 'day') {
    return [...points];
  }
  const buckets = new Map<string, ActivityPoint>();
  for (const point of points) {
    const time = parseIsoDate(point.date);
    const key = isoDate(grouping === 'week' ? weekStart(time) : monthStart(time));
    const existing = buckets.get(key);
    if (existing) {
      existing.commits += point.commits;
      existing.insertions += point.insertions;
      existing.deletions += point.deletions;
      continue;
    }
    buckets.set(key, {
      date: key,
      commits: point.commits,
      insertions: point.insertions,
      deletions: point.deletions,
    });
  }
  return Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function sumActivity(points: readonly ActivityPoint[]): ActivityTotals {
  return points.reduce<ActivityTotals>(
    (acc, point) => ({
      commits: acc.commits + point.commits,
      insertions: acc.insertions + point.insertions,
      deletions: acc.deletions + point.deletions,
    }),
    { commits: 0, insertions: 0, deletions: 0 }
  );
}

export function deltaPercent(current: number, previous: number): number | null {
  if (previous <= 0) {
    return null;
  }
  return Math.round(((current - previous) / previous) * 100);
}

export function compactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs < 1_000) {
    return String(Math.round(value));
  }
  if (abs < 1_000_000) {
    const scaled = value / 1_000;
    return `${abs < 10_000 ? scaled.toFixed(1) : Math.round(scaled)}k`;
  }
  const scaled = value / 1_000_000;
  return `${abs < 10_000_000 ? scaled.toFixed(1) : Math.round(scaled)}M`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

export function bucketLabel(date: string, grouping: ActivityGrouping): string {
  const time = parseIsoDate(date);
  const parsed = new Date(time);
  const month = MONTHS[parsed.getUTCMonth()];
  if (grouping === 'month') {
    return `${month} ${String(parsed.getUTCFullYear()).slice(2)}`;
  }
  return `${parsed.getUTCDate()} ${month}`;
}

export function daysSince(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const time = typeof value === 'number' ? (value < 1e12 ? value * 1000 : value) : Date.parse(value);
  if (!Number.isFinite(time) || Number.isNaN(time)) {
    return null;
  }
  return (Date.now() - time) / DAY_MS;
}
