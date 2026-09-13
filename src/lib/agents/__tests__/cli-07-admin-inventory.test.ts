import { describe, expect, it } from "vitest";

import { CLAUDE_CLI_COMMAND_INVENTORY, cliCommandCapability } from "@/lib/agents/cli-commands";

describe("CLI-07 admin surfaces", () => {
  it("lists self-hosted runner and gateway as admin scope commands", () => {
    const runner = CLAUDE_CLI_COMMAND_INVENTORY.find((entry) => entry.name === "runner");
    const gateway = CLAUDE_CLI_COMMAND_INVENTORY.find((entry) => entry.name === "gateway");
    expect(runner?.scope).toBe("admin");
    expect(gateway?.scope).toBe("admin");
  });

  it("reports admin commands as unsupported with an administration reason", () => {
    const result = cliCommandCapability("runner", "2.0.0");
    expect(result.status).toBe("unsupported");
    expect(result.reason).toBe("Administrationsfläche, nicht in /agents");
  });
});
