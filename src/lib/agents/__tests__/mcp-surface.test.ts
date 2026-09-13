import { describe, expect, it } from "vitest";

import { mcpSurfaceCapability } from "@/lib/agents/capability-types";

describe("mcpSurfaceCapability", () => {
  it("returns a defined status for a known driver/surface combo", () => {
    const result = mcpSurfaceCapability("resources", "claude");
    expect(result.status).toBe("unsupported");
    expect(result.reason).toBe("not exposed by CLI transport");
  });

  it("defaults to unsupported for an unknown driver", () => {
    const result = mcpSurfaceCapability("resources", "nonexistent-driver");
    expect(result.status).toBe("unsupported");
    expect(result.reason).toContain("unknown driver");
  });

  it("defaults to unsupported for an unknown surface on a known driver", () => {
    const result = mcpSurfaceCapability("nonexistent-surface" as never, "claude");
    expect(result.status).toBe("unsupported");
  });

  it("never throws", () => {
    expect(() => mcpSurfaceCapability("prompts" as never, "" as never)).not.toThrow();
  });
});
