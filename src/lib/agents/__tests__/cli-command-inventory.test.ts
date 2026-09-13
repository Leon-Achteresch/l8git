import { describe, expect, it } from "vitest";

import { CLAUDE_CLI_COMMAND_INVENTORY, cliCommandCapability } from "@/lib/agents/cli-commands";
import { shouldRunNativeSlashWithInventory } from "@/lib/agents/slash-commands";

describe("cliCommandCapability", () => {
  it("marks commands unavailable when they are not in the versioned inventory", () => {
    expect(cliCommandCapability("not-a-real-flag", "2.0.0").status).toBe("unavailable");
  });

  it("marks version-gated commands unsupported below minVersion", () => {
    const spec = CLAUDE_CLI_COMMAND_INVENTORY.find((entry) => entry.name === "ps");
    expect(spec?.minVersion).toBe("1.0.0");
    expect(cliCommandCapability("ps", "0.9.0").status).toBe("unsupported");
    expect(cliCommandCapability("ps", "1.0.0").status).toBe("supported");
  });

  it("marks version-gated commands unsupported when the version is unknown", () => {
    expect(cliCommandCapability("ps", null).status).toBe("unsupported");
  });

  it("supports commands without a minVersion regardless of the current version", () => {
    expect(cliCommandCapability("model", null).status).toBe("supported");
  });
});

describe("shouldRunNativeSlashWithInventory", () => {
  it("blocks routing when the capability lookup reports unavailable", () => {
    const routed = shouldRunNativeSlashWithInventory("goal", "claude", () => ({ status: "unavailable" }));
    expect(routed).toBe(false);
  });

  it("routes natively when supported and the provider allows the command", () => {
    const routed = shouldRunNativeSlashWithInventory("model", "claude", (name) =>
      cliCommandCapability(name, "2.0.0"),
    );
    expect(routed).toBe(true);
  });

  it("still defers to provider support before consulting the inventory", () => {
    const routed = shouldRunNativeSlashWithInventory("apps", "claude", () => ({ status: "supported" }));
    expect(routed).toBe(false);
  });
});
