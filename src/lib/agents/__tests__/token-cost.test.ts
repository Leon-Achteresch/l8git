import { describe, expect, it } from "vitest";

import {
  accumulateUsage,
  estimateCost,
  formatTokens,
  formatUsd,
  modelPrice,
} from "@/lib/agents/token-cost";

describe("modelPrice", () => {
  it("matches exact model ids", () => {
    expect(modelPrice("claude-sonnet-4-5")).toEqual({ input: 3, output: 15 });
  });

  it("matches the longest key for prefixed variants", () => {
    expect(modelPrice("us.anthropic.claude-opus-4-5-v1")).toEqual({ input: 5, output: 25 });
    expect(modelPrice("gpt-5-mini-2025-08-07")?.input).toBe(0.25);
  });

  it("prices legacy opus and sonnet models", () => {
    expect(modelPrice("claude-opus-4-1")).toEqual({ input: 15, output: 75 });
    expect(modelPrice("claude-sonnet-4-0")).toEqual({ input: 3, output: 15 });
  });

  it("is case-insensitive", () => {
    expect(modelPrice("Claude-Haiku-4-5")).toEqual({ input: 1, output: 5 });
  });

  it("returns null for unknown or empty models", () => {
    expect(modelPrice("some-local-model")).toBeNull();
    expect(modelPrice(null)).toBeNull();
    expect(modelPrice(undefined)).toBeNull();
    expect(modelPrice("")).toBeNull();
  });
});

describe("estimateCost", () => {
  const usage = {
    totalTokens: 1_100_000,
    modelContextWindow: null,
    inputTokens: 1_000_000,
    outputTokens: 100_000,
    cacheReadTokens: 500_000,
    cacheWriteTokens: 200_000,
  };

  it("computes per-bucket and total cost", () => {
    const cost = estimateCost(usage, "claude-sonnet-4-5");
    expect(cost).not.toBeNull();
    expect(cost?.inputUsd).toBeCloseTo(3);
    expect(cost?.outputUsd).toBeCloseTo(1.5);
    expect(cost?.cacheWriteUsd).toBeCloseTo(0.2 * 3 * 1.25);
    expect(cost?.cacheReadUsd).toBeCloseTo(0.5 * 0.3);
    expect(cost?.totalUsd).toBeCloseTo(3 + 1.5 + 0.75 + 0.15);
    expect(cost?.cacheSavedUsd).toBeCloseTo(0.5 * (3 - 0.3));
  });

  it("uses explicit cache-read rates when the price table has them", () => {
    const cost = estimateCost(usage, "gpt-5");
    expect(cost?.cacheReadUsd).toBeCloseTo(0.5 * 0.125);
  });

  it("returns null without usage, without price, or with all-zero usage", () => {
    expect(estimateCost(undefined, "gpt-5")).toBeNull();
    expect(estimateCost(usage, "unknown-model")).toBeNull();
    expect(
      estimateCost(
        {
          totalTokens: 0,
          modelContextWindow: null,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        "gpt-5",
      ),
    ).toBeNull();
  });
});

describe("formatTokens", () => {
  it("formats plain, thousands and millions", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(999)).toBe("999");
    expect(formatTokens(1_500)).toBe("1.5k");
    expect(formatTokens(120_000)).toBe("120k");
    expect(formatTokens(1_500_000)).toBe("1.5M");
    expect(formatTokens(12_000_000)).toBe("12M");
  });
});

describe("formatUsd", () => {
  it("scales precision with magnitude", () => {
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(0.0042)).toBe("$0.0042");
    expect(formatUsd(0.123)).toBe("$0.123");
    expect(formatUsd(1.234)).toBe("$1.23");
  });
});

describe("accumulateUsage", () => {
  it("adds deltas onto previous usage", () => {
    const first = accumulateUsage(undefined, { inputTokens: 100, outputTokens: 10 });
    const second = accumulateUsage(first, {
      inputTokens: 50,
      outputTokens: 5,
      cacheReadTokens: 20,
    });
    expect(second.inputTokens).toBe(150);
    expect(second.outputTokens).toBe(15);
    expect(second.cacheReadTokens).toBe(20);
    expect(second.cacheWriteTokens).toBe(0);
    expect(second.totalTokens).toBe(165);
  });

  it("prefers an explicit totalTokens and carries the context window forward", () => {
    const first = accumulateUsage(undefined, {
      inputTokens: 1,
      modelContextWindow: 200_000,
    });
    const second = accumulateUsage(first, { inputTokens: 1, totalTokens: 999 });
    expect(second.totalTokens).toBe(999);
    expect(second.modelContextWindow).toBe(200_000);
  });
});
