import { describe, expect, it } from "vitest";

import { normalizeThinkingConfig, type ModelThinkingCapabilities } from "@/lib/agents/model-catalog";

const effortModel: ModelThinkingCapabilities = {
  supportsEffort: true,
  effortLevels: ["low", "medium", "high"],
  supportsThinking: false,
};

const thinkingModel: ModelThinkingCapabilities = {
  supportsEffort: false,
  effortLevels: [],
  supportsThinking: true,
  thinkingBudgetRange: { min: 1024, max: 8192 },
};

describe("normalizeThinkingConfig", () => {
  it("keeps a valid effort level for effort-capable models", () => {
    expect(normalizeThinkingConfig(effortModel, { effort: "high" })).toEqual({ effort: "high" });
  });

  it("falls back to the first effort level for an unknown value", () => {
    expect(normalizeThinkingConfig(effortModel, { effort: "extreme" })).toEqual({ effort: "low" });
  });

  it("omits effort for models that do not support it", () => {
    expect(normalizeThinkingConfig(thinkingModel, { effort: "high" }).effort).toBeUndefined();
  });

  it("clamps a thinking budget to the model's supported range", () => {
    expect(normalizeThinkingConfig(thinkingModel, { thinking: { enabled: true, budgetTokens: 99999 } })).toEqual({
      thinking: { enabled: true, budgetTokens: 8192 },
    });
    expect(normalizeThinkingConfig(thinkingModel, { thinking: { enabled: true, budgetTokens: 1 } })).toEqual({
      thinking: { enabled: true, budgetTokens: 1024 },
    });
  });

  it("omits thinking for models that do not support it", () => {
    expect(normalizeThinkingConfig(effortModel, { thinking: { enabled: true } }).thinking).toBeUndefined();
  });
});
