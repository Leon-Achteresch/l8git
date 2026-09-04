import { describe, expect, it } from "vitest";

import {
  buildDayBuckets,
  buildHeatmap,
  formatCompact,
  levelFor,
  longestTaskLabel,
  monthBuckets,
  tokensSeries,
  topStreakDays,
} from "@/components/agents/profile/agent-profile-data";
import type { AgentOverviewEntry } from "@/lib/agents/overview";

function entry(partial: Partial<AgentOverviewEntry> & { updatedAt: number }): AgentOverviewEntry {
  return {
    key: `codex:${partial.threadId ?? "t"}`,
    provider: "codex",
    threadId: partial.threadId ?? "t",
    path: "/tmp/l8git",
    repoName: "l8git",
    basePath: "/tmp/l8git",
    branch: "main",
    isWorktree: false,
    title: "thread",
    preview: "",
    status: "idle",
    pendingRequests: 0,
    costUsd: null,
    tokens: 0,
    ...partial,
  } as AgentOverviewEntry;
}

const NOW = new Date("2026-09-04T12:00:00Z");
const DAY = 86_400;
const ts = (daysAgo: number) => Math.floor(NOW.getTime() / 1000) - daysAgo * DAY;

describe("agent-profile-data", () => {
  it("formats compact numbers", () => {
    expect(formatCompact(0)).toBe("0");
    expect(formatCompact(999)).toBe("999");
    expect(formatCompact(1500)).toBe("1.5K");
    expect(formatCompact(2_400_000)).toBe("2.4M");
    expect(formatCompact(9_000_000_000)).toBe("9B");
  });

  it("buckets entries per day", () => {
    const entries = [
      entry({ threadId: "a", updatedAt: ts(0), tokens: 100, costUsd: 1 }),
      entry({ threadId: "b", updatedAt: ts(0), tokens: 50, costUsd: 2 }),
      entry({ threadId: "c", updatedAt: ts(2), tokens: 10, costUsd: 0.5 }),
    ];
    const buckets = buildDayBuckets(entries, 3, NOW);
    expect(buckets).toHaveLength(3);
    expect(buckets[2]).toMatchObject({ count: 2, tokens: 150, costUsd: 3 });
    expect(buckets[0]).toMatchObject({ count: 1, tokens: 10 });
    expect(buckets[1].count).toBe(0);
  });

  it("levels heat cells relative to max", () => {
    expect(levelFor(0, 10)).toBe(0);
    expect(levelFor(1, 10)).toBe(1);
    expect(levelFor(5, 10)).toBe(2);
    expect(levelFor(7, 10)).toBe(3);
    expect(levelFor(10, 10)).toBe(4);
  });

  it("builds week columns oldest-first", () => {
    const entries = [entry({ threadId: "a", updatedAt: ts(0) })];
    const columns = buildHeatmap(entries, 2, NOW);
    expect(columns).toHaveLength(2);
    expect(columns.flat()).toHaveLength(14);
    const last = columns[1][6];
    expect(last.count).toBe(1);
    expect(last.level).toBe(4);
  });

  it("computes top streak across gaps", () => {
    const entries = [
      entry({ threadId: "a", updatedAt: ts(0) }),
      entry({ threadId: "b", updatedAt: ts(1) }),
      entry({ threadId: "c", updatedAt: ts(2) }),
      entry({ threadId: "d", updatedAt: ts(5) }),
    ];
    expect(topStreakDays(entries)).toBe(3);
    expect(topStreakDays([])).toBe(0);
  });

  it("labels longest task", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    expect(longestTaskLabel([])).toBe("—");
    expect(longestTaskLabel([entry({ threadId: "a", updatedAt: nowSec - 30 * 60 })])).toBe("1h");
    expect(longestTaskLabel([entry({ threadId: "a", updatedAt: nowSec - 10 * DAY })])).toBe("10d");
  });

  it("buckets a calendar month and series", () => {
    const entries = [entry({ threadId: "a", updatedAt: ts(1), tokens: 42 })];
    const buckets = monthBuckets(entries, 2026, 8); // September (0-based)
    expect(buckets.length).toBeGreaterThanOrEqual(28);
    const series = tokensSeries(entries, 7, NOW);
    expect(series).toHaveLength(7);
    expect(series.reduce((s, v) => s + v, 0)).toBe(42);
  });
});
