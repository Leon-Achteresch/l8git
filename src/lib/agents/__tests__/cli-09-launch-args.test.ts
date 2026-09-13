import { describe, expect, it } from "vitest";

import { buildClaudeLaunchArgs } from "@/lib/agents/cli-commands";

describe("CLI-09 model and output options", () => {
  it("builds output-format, model, fallback-model and max-turns flags", () => {
    const result = buildClaudeLaunchArgs({
      settingSources: [],
      trusted: false,
      outputFormat: "json",
      maxTurns: 3,
      model: "claude-opus",
      fallbackModel: "claude-sonnet",
      thinkingEffort: "high",
    });
    expect(result.args).toEqual([
      "--model",
      "claude-opus",
      "--fallback-model",
      "claude-sonnet",
      "--thinking-effort",
      "high",
      "--output-format",
      "json",
      "--max-turns",
      "3",
    ]);
  });

  it("rejects jsonSchema without output-format json", () => {
    expect(() =>
      buildClaudeLaunchArgs({
        settingSources: [],
        trusted: false,
        jsonSchema: "{}",
      }),
    ).toThrow();
  });

  it("accepts jsonSchema when output-format is json", () => {
    const result = buildClaudeLaunchArgs({
      settingSources: [],
      trusted: false,
      outputFormat: "json",
      jsonSchema: '{"type":"object"}',
    });
    expect(result.args).toContain("--json-schema");
  });

  it("rejects fallbackModel without a primary model", () => {
    expect(() =>
      buildClaudeLaunchArgs({
        settingSources: [],
        trusted: false,
        fallbackModel: "claude-sonnet",
      }),
    ).toThrow();
  });
});
