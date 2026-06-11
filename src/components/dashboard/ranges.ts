import type { ActivityGrouping } from "@/lib/dashboard-aggregations";

export type RangeKey = "14d" | "1m" | "3m" | "6m" | "1y";

export const RANGE_KEYS: RangeKey[] = ["14d", "1m", "3m", "6m", "1y"];

export const RANGES: Record<RangeKey, { days: number; grouping: ActivityGrouping }> = {
  "14d": { days: 14, grouping: "day" },
  "1m": { days: 30, grouping: "day" },
  "3m": { days: 91, grouping: "week" },
  "6m": { days: 182, grouping: "week" },
  "1y": { days: 364, grouping: "month" },
};
