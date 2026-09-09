import { describe, expect, it } from "vitest";

import {
  applyBackendPreset,
  CLAUDE_BACKEND_PRESETS,
  loadModelCatalog,
  mergeModelCatalog,
  resolveModelCatalog,
  saveModelCatalog,
} from "@/lib/agents/model-catalog";
import type { AgentModelOption } from "@/lib/agents/types";

function model(id: string): AgentModelOption {
  return {
    id,
    label: id,
    description: "",
    isDefault: false,
    inputModalities: [],
    reasoningEfforts: [],
    defaultReasoningEffort: "medium",
    serviceTiers: [],
    defaultServiceTier: null,
    supportsPersonality: false,
  };
}

describe("model catalog isolation per instance", () => {
  it("keeps two instances of the same provider separate", () => {
    saveModelCatalog("claude", [model("opus")], "instance-a");
    saveModelCatalog("claude", [model("sonnet")], "instance-b");
    expect(loadModelCatalog("claude", "instance-a").map((m) => m.id)).toEqual(["opus"]);
    expect(loadModelCatalog("claude", "instance-b").map((m) => m.id)).toEqual(["sonnet"]);
  });
});

describe("mergeModelCatalog", () => {
  it("lets live entries win over static defaults", () => {
    const merged = mergeModelCatalog([model("opus")], [{ ...model("opus"), label: "Opus 4.5" }]);
    expect(merged).toHaveLength(1);
    expect(merged[0].label).toBe("Opus 4.5");
  });

  it("clears the catalog when the authoritative live response is empty", () => {
    expect(mergeModelCatalog([model("opus")], [])).toEqual([]);
  });
});

describe("applyBackendPreset", () => {
  it("returns the preset env plus configured required keys", () => {
    const bedrock = CLAUDE_BACKEND_PRESETS.find((p) => p.id === "bedrock")!;
    const result = applyBackendPreset(
      { AWS_REGION: "us-east-1", ANTHROPIC_BEDROCK_MODEL_ID: "anthropic.claude-3-v1:0" },
      bedrock,
    );
    expect(result.env.CLAUDE_CODE_USE_BEDROCK).toBe("1");
    expect(result.env.AWS_REGION).toBe("us-east-1");
    expect(result.warnings).toEqual([]);
  });

  it("warns without deleting anything when a required key is missing or empty", () => {
    const vertex = CLAUDE_BACKEND_PRESETS.find((p) => p.id === "vertex")!;
    const result = applyBackendPreset({ ANTHROPIC_VERTEX_PROJECT_ID: "" }, vertex);
    expect(result.warnings).toEqual([
      "missing required key: ANTHROPIC_VERTEX_PROJECT_ID",
      "missing required key: CLOUD_ML_REGION",
    ]);
    expect(result.env.CLAUDE_CODE_USE_VERTEX).toBe("1");
    expect(result.env.ANTHROPIC_VERTEX_PROJECT_ID).toBeUndefined();
  });
});

describe("resolveModelCatalog", () => {
  it("persists and returns live results, marking the source as live", () => {
    const result = resolveModelCatalog({
      provider: "claude",
      instanceId: "resolve-live",
      staticDefaults: [model("opus")],
      live: [model("sonnet")],
    });
    expect(result.source).toBe("live");
    expect(result.models.map((m) => m.id)).toEqual(["sonnet"]);
    expect(loadModelCatalog("claude", "resolve-live").map((m) => m.id)).toEqual(["sonnet"]);
  });

  it("falls back to the cache and marks it explicitly when offline", () => {
    saveModelCatalog("claude", [model("cached")], "resolve-offline");
    const result = resolveModelCatalog({
      provider: "claude",
      instanceId: "resolve-offline",
      staticDefaults: [model("opus")],
      live: null,
    });
    expect(result.source).toBe("cache");
    expect(result.models.map((m) => m.id)).toEqual(["cached"]);
  });

  it("falls back to static defaults when there is neither a live response nor a cache", () => {
    const result = resolveModelCatalog({
      provider: "claude",
      instanceId: "resolve-empty",
      staticDefaults: [model("opus")],
      live: null,
    });
    expect(result.source).toBe("defaults");
    expect(result.models.map((m) => m.id)).toEqual(["opus"]);
  });
});
