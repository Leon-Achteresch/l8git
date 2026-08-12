import { beforeEach, describe, expect, it } from "vitest";

import {
  addToBucket,
  dayKey,
  lastDayKeys,
  pruneDays,
  sumDays,
  usageDelta,
  usageTotals,
  useUsageLedgerStore,
  type UsageDay,
} from "@/lib/agents/usage-ledger";

describe("dayKey and lastDayKeys", () => {
  it("formats local dates and counts backwards", () => {
    const date = new Date(2026, 7, 12);
    expect(dayKey(date)).toBe("2026-08-12");
    expect(lastDayKeys(3, date)).toEqual(["2026-08-12", "2026-08-11", "2026-08-10"]);
  });
});

describe("usageDelta", () => {
  it("returns null for the first observation", () => {
    expect(usageDelta(undefined, usageTotals(undefined))).toBeNull();
  });

  it("returns positive deltas and clamps regressions to zero", () => {
    const previous = { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 };
    const next = { inputTokens: 150, outputTokens: 40, cacheReadTokens: 10, cacheWriteTokens: 0 };
    expect(usageDelta(previous, next)).toEqual({
      inputTokens: 50,
      outputTokens: 0,
      cacheReadTokens: 10,
      cacheWriteTokens: 0,
    });
  });

  it("returns null when nothing changed", () => {
    const totals = { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 };
    expect(usageDelta(totals, totals)).toBeNull();
  });
});

describe("pruneDays", () => {
  it("keeps only the most recent keys up to today", () => {
    const bucket = addToBucket(undefined, {
      inputTokens: 1,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    }, 0);
    const days: Record<string, UsageDay> = {
      "2026-01-01": { codex: bucket },
      "2026-08-11": { codex: bucket },
      "2026-08-12": { codex: bucket },
      "2099-01-01": { codex: bucket },
    };
    const pruned = pruneDays(days, "2026-08-12", 2);
    expect(Object.keys(pruned).sort()).toEqual(["2026-08-11", "2026-08-12"]);
  });
});

describe("sumDays", () => {
  it("aggregates buckets across days and providers", () => {
    const delta = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 1, cacheWriteTokens: 2 };
    const days: Record<string, UsageDay> = {
      "2026-08-11": { codex: addToBucket(undefined, delta, 0.5) },
      "2026-08-12": {
        codex: addToBucket(undefined, delta, 0.25),
        claude: addToBucket(undefined, delta, 0.25),
      },
    };
    const total = sumDays(days, ["2026-08-11", "2026-08-12", "2026-08-13"]);
    expect(total.inputTokens).toBe(30);
    expect(total.outputTokens).toBe(15);
    expect(total.costUsd).toBeCloseTo(1);
  });
});

describe("useUsageLedgerStore.record", () => {
  beforeEach(() => {
    useUsageLedgerStore.setState({ days: {} });
  });

  it("accumulates deltas with model-based cost under today", () => {
    const delta = {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    useUsageLedgerStore.getState().record("claude", "claude-sonnet-4-5", delta);
    useUsageLedgerStore.getState().record("claude", "claude-sonnet-4-5", delta);
    const bucket = useUsageLedgerStore.getState().days[dayKey()]?.claude;
    expect(bucket?.inputTokens).toBe(2_000_000);
    expect(bucket?.costUsd).toBeCloseTo(6);
  });

  it("records unknown models with zero cost", () => {
    useUsageLedgerStore.getState().record("cursor", "mystery-model", {
      inputTokens: 10,
      outputTokens: 10,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    const bucket = useUsageLedgerStore.getState().days[dayKey()]?.cursor;
    expect(bucket?.costUsd).toBe(0);
    expect(bucket?.inputTokens).toBe(10);
  });
});
