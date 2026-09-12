import { describe, expect, it } from "vitest";

import { CLAUDE_CLI_COMMAND_INVENTORY, cliCommandCapability, classifySessionOrigin } from "@/lib/agents/cli-commands";

describe("CLI-06 native remote and cloud sessions", () => {
  it("marks remote as admin scope with a reason about the separate remote layer", () => {
    const spec = CLAUDE_CLI_COMMAND_INVENTORY.find((entry) => entry.name === "remote");
    expect(spec?.scope).toBe("admin");
    expect(spec?.unsupportedReason).toContain("Remote-Ebene");
    expect(cliCommandCapability("remote", "1.0.0").status).toBe("unsupported");
  });

  it("classifies session origin", () => {
    expect(classifySessionOrigin({})).toBe("local");
    expect(classifySessionOrigin({ isNativeRemote: true })).toBe("nativeRemote");
    expect(classifySessionOrigin({ isL8gitRemote: true })).toBe("l8gitRemote");
  });

  it("prefers l8git remote classification when both flags are set", () => {
    expect(classifySessionOrigin({ isL8gitRemote: true, isNativeRemote: true })).toBe("l8gitRemote");
  });
});
