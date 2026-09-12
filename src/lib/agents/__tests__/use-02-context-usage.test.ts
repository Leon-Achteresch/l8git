import { describe, expect, it } from "vitest";

import { contextUsage, contextWindowFor } from "@/lib/agents/token-cost";

describe("USE-02 context usage", () => {
  it("returns unmeasured when window is unknown", () => {
    const result = contextUsage({ activeContext: 5000, contextWindow: null, measured: true });
    expect(result.measured).toBe(false);
    expect(result.percent).toBeNull();
    expect(result.remaining).toBeNull();
  });

  it("returns unmeasured when usage was never measured", () => {
    const result = contextUsage({ activeContext: 5000, contextWindow: 200_000, measured: false });
    expect(result.measured).toBe(false);
  });

  it("caps percent at 100 while keeping oversized usage detectable", () => {
    const result = contextUsage({ activeContext: 300_000, contextWindow: 200_000, measured: true });
    expect(result.measured).toBe(true);
    expect(result.percent).toBe(100);
    expect(result.remaining).toBe(0);
  });

  it("resolves contextWindowFor from a catalog", () => {
    const catalog = [{ id: "claude-sonnet-5", contextWindow: 200_000 }];
    expect(contextWindowFor("claude-sonnet-5", catalog)).toBe(200_000);
    expect(contextWindowFor("unknown-model", catalog)).toBeNull();
  });
});
