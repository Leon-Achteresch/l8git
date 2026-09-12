import { describe, expect, it } from "vitest";

import { memoryCommandCapability } from "@/lib/agents/capability-types";

describe("memoryCommandCapability", () => {
  it("offers native memory commands for claude when support is confirmed", () => {
    expect(memoryCommandCapability("list", "claude").status).toBe("native");
    expect(memoryCommandCapability("clear", "claude").status).toBe("native");
  });

  it("does not emulate a Claude success with an empty list for the Codex-only import method", () => {
    const result = memoryCommandCapability("import", "claude");
    expect(result.status).toBe("unsupported");
    expect(result.reason).toContain("Codex-only");
  });

  it("never reports an unsupported command as unconfirmed success for an unknown driver", () => {
    const result = memoryCommandCapability("list", "nonexistent-driver");
    expect(result.status).toBe("unsupported");
    expect(result.reason).toContain("unknown driver");
  });
});
