import { describe, expect, it } from "vitest";

import { costBreakdown } from "@/lib/agents/token-cost";

describe("USE-05 cost breakdown", () => {
  it("prefers the provider-reported total cost", () => {
    const result = costBreakdown({ totalCostUsd: 0.42 }, "claude-sonnet-5", "instance-a");
    expect(result.source).toBe("provider");
    expect(result.total).toBe(0.42);
    expect(result.perInstance["instance-a"]).toBe(0.42);
  });

  it("falls back to an estimate flagged as such for mixed models", () => {
    const result = costBreakdown(
      { tokenUsage: { totalTokens: 1000, modelContextWindow: null, inputTokens: 1_000_000, outputTokens: 0 } },
      "claude-sonnet-5",
      "instance-b",
    );
    expect(result.source).toBe("estimated");
    expect(result.total).toBeCloseTo(3, 5);
    expect(result.perInstance["instance-b"]).toBeCloseTo(3, 5);
  });

  it("leaves total open for an unknown price", () => {
    const result = costBreakdown(
      { tokenUsage: { totalTokens: 100, modelContextWindow: null, inputTokens: 100, outputTokens: 0 } },
      "totally-unknown-model",
      "instance-c",
    );
    expect(result.total).toBeNull();
    expect(result.perInstance).toEqual({});
  });

  it("does not duplicate results across instances", () => {
    const first = costBreakdown({ totalCostUsd: 1 }, "claude-sonnet-5", "instance-a");
    const second = costBreakdown({ totalCostUsd: 2 }, "claude-sonnet-5", "instance-b");
    expect(first.perInstance).toEqual({ "instance-a": 1 });
    expect(second.perInstance).toEqual({ "instance-b": 2 });
  });
});
