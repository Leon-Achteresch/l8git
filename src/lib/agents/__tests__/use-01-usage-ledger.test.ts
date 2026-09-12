import { describe, expect, it } from "vitest";

import { isUsageMeasured, usageDelta, usageTotals } from "@/lib/agents/usage-ledger";
import { accumulateUsage } from "@/lib/agents/token-cost";
import type { AgentTokenUsage } from "@/lib/agents/types";

describe("USE-01 separate token accounting", () => {
  it("treats missing cache counters as zero, not NaN", () => {
    const usage = accumulateUsage(undefined, { inputTokens: 100, outputTokens: 20 });
    expect(usage.cacheReadTokens).toBe(0);
    expect(usage.cacheWriteTokens).toBe(0);
    expect(Number.isNaN(usage.cacheReadTokens)).toBe(false);
  });

  it("flags unmeasured usage distinctly from a measured zero", () => {
    expect(isUsageMeasured(undefined)).toBe(false);
    expect(isUsageMeasured({ totalTokens: 0, modelContextWindow: null })).toBe(false);
    expect(isUsageMeasured({ totalTokens: 0, modelContextWindow: null, inputTokens: 0 })).toBe(true);
  });

  it("does not double count a replayed result or a loaded history transcript", () => {
    const loadedFromHistory: AgentTokenUsage = {
      totalTokens: 500,
      modelContextWindow: null,
      inputTokens: 400,
      outputTokens: 100,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    expect(usageDelta(undefined, usageTotals(loadedFromHistory))).toBeNull();

    const previous = usageTotals(loadedFromHistory);
    const replay = usageTotals(loadedFromHistory);
    expect(usageDelta(previous, replay)).toBeNull();
  });
});
