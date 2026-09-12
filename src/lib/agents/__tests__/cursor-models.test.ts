import { describe, expect, it } from "vitest";

import { cursorEffortLabel, cursorModelId, groupCursorModels, parseCursorModels } from "@/lib/agents/providers/cursor/client";

const OUTPUT = `Available models:
gpt-5 - GPT-5
gpt-5-high - GPT-5 (high)
gpt-5-low - GPT-5 (low)
gpt-5.3-codex-high - Codex 5.3 High
gpt-5.3-codex-high-fast - Codex 5.3 High Fast
claude-4.5-sonnet - Claude Sonnet 4.5 (default)
claude-4.5-sonnet-thinking - Claude Sonnet 4.5 Thinking
kimi-k3-low - Kimi K3 Low
kimi-k3-max - Kimi K3
grok - Grok
`;

describe("groupCursorModels", () => {
  it("folds effort suffixes into the base model", () => {
    expect(groupCursorModels(parseCursorModels(OUTPUT))).toEqual([
      { id: "gpt-5", label: "GPT-5", efforts: ["", "high", "low"] },
      { id: "gpt-5.3-codex", label: "Codex 5.3 High", efforts: ["high", "high-fast"] },
      { id: "claude-4.5-sonnet", label: "Claude Sonnet 4.5", efforts: ["", "thinking"] },
      { id: "kimi-k3", label: "Kimi K3", efforts: ["low", "max"] },
      { id: "grok", label: "Grok", efforts: [] },
    ]);
  });
});

describe("cursorEffortLabel", () => {
  it("names the chained effort tokens", () => {
    expect(cursorEffortLabel("")).toBe("Default");
    expect(cursorEffortLabel("xhigh-fast")).toBe("Extra High Fast");
    expect(cursorEffortLabel("thinking-max")).toBe("Thinking Max");
  });
});

describe("cursorModelId", () => {
  it("rebuilds the variant id from model and effort", () => {
    expect(cursorModelId("gpt-5", "high")).toBe("gpt-5-high");
    expect(cursorModelId("gpt-5", "")).toBe("gpt-5");
    expect(cursorModelId(null, "high")).toBeUndefined();
  });
});
