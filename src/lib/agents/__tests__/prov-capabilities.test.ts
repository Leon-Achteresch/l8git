import { describe, expect, it } from "vitest";

import type { AgentCapability } from "@/lib/agents/types";

const CAPABILITY_MATRIX: Record<string, AgentCapability> = {
  images: { status: "supported" },
  steer: { status: "unsupported", reason: "cursor-agent has no mid-turn steer command" },
  rollback: { status: "unavailable", reason: "requires claude >= 2.1", minVersion: "2.1.0" },
  compact: { status: "supported" },
  fast: { status: "unsupported", reason: "codex-only flag" },
  mcp: { status: "supported" },
  questions: { status: "unsupported", reason: "no native elicitation protocol" },
};

describe("capability contract", () => {
  it("reports supported, unsupported or unavailable with a reason for every gated feature", () => {
    for (const [name, capability] of Object.entries(CAPABILITY_MATRIX)) {
      expect(["supported", "unsupported", "unavailable"]).toContain(capability.status);
      if (capability.status !== "supported") {
        expect(capability.reason, `${name} needs a reason when not supported`).toBeTruthy();
      }
    }
    expect(CAPABILITY_MATRIX.rollback.minVersion).toBe("2.1.0");
  });
});
