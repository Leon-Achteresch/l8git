import { describe, expect, it } from "vitest";

import { validateTurnBudget } from "@/lib/agents/model-catalog";
import { buildClaudeLaunchArgs } from "@/lib/agents/cli-commands";

const fullCapabilities = { structuredOutput: true, maxTurns: true, maxBudget: true };

describe("MOD-07 turn budget and structured output", () => {
  it("accepts a valid schema and passes it into the launch args", () => {
    const validation = validateTurnBudget(
      { maxTurns: 5, outputSchema: '{"type":"object"}' },
      fullCapabilities,
    );
    expect(validation.valid).toBe(true);
    const result = buildClaudeLaunchArgs({
      settingSources: [],
      trusted: true,
      outputFormat: "json",
      jsonSchema: '{"type":"object"}',
      maxTurns: 5,
    });
    expect(result.args).toContain("--max-turns");
    expect(result.args).toContain("--json-schema");
  });

  it("rejects an invalid schema before start", () => {
    const validation = validateTurnBudget({ outputSchema: "{not json" }, fullCapabilities);
    expect(validation.outputSchema.status).toBe("unsupported");
    expect(validation.valid).toBe(false);
  });

  it("marks maxTurns unsupported when the CLI lacks the capability, with a reason", () => {
    const validation = validateTurnBudget(
      { maxTurns: 3 },
      { structuredOutput: true, maxTurns: false, maxBudget: true },
    );
    expect(validation.maxTurns.status).toBe("unsupported");
    expect(validation.maxTurns.reason).toBeTruthy();
  });

  it("does not silently limit the default chat when no budget is set", () => {
    const validation = validateTurnBudget({}, fullCapabilities);
    expect(validation.valid).toBe(true);
    const result = buildClaudeLaunchArgs({ settingSources: [], trusted: true });
    expect(result.args).not.toContain("--max-turns");
    expect(result.args).not.toContain("--max-budget-usd");
  });

  it("rejects a non-positive cost budget", () => {
    const validation = validateTurnBudget({ maxBudgetUsd: 0 }, fullCapabilities);
    expect(validation.maxBudgetUsd.status).toBe("unsupported");
  });
});
