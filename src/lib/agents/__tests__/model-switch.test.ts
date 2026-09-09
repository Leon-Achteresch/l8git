import { describe, expect, it } from "vitest";

import { planModelSwitch } from "@/lib/agents/model-catalog";

const catalog = [{ id: "opus" }, { id: "sonnet" }];

describe("planModelSwitch", () => {
  it("applies immediately when no turn is active", () => {
    expect(planModelSwitch({ current: "opus", target: "sonnet", turnActive: false, catalog })).toEqual({
      apply: "immediate",
    });
  });

  it("defers to the next turn when a turn is currently running", () => {
    const plan = planModelSwitch({ current: "opus", target: "sonnet", turnActive: true, catalog });
    expect(plan.apply).toBe("nextTurn");
  });

  it("rejects switching to a model outside the catalog", () => {
    const plan = planModelSwitch({ current: "opus", target: "unknown", turnActive: false, catalog });
    expect(plan.apply).toBe("reject");
    expect(plan.reason).toBe("unknown-model");
  });

  it("treats no-op switches as immediate even mid-turn", () => {
    expect(planModelSwitch({ current: "opus", target: "opus", turnActive: true, catalog })).toEqual({
      apply: "immediate",
    });
  });
});
