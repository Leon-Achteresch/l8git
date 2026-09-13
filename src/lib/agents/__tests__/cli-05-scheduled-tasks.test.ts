import { describe, expect, it } from "vitest";

import { CLAUDE_CLI_COMMAND_INVENTORY, cliCommandCapability, type ScheduledTaskSummary } from "@/lib/agents/cli-commands";

describe("CLI-05 scheduled tasks inventory", () => {
  it("marks schedule as admin scope with a reason", () => {
    const spec = CLAUDE_CLI_COMMAND_INVENTORY.find((entry) => entry.name === "schedule");
    expect(spec?.scope).toBe("admin");
    expect(spec?.unsupportedReason).toBeTruthy();
  });

  it("reports schedule as unsupported via capability lookup", () => {
    const capability = cliCommandCapability("schedule", "1.0.0");
    expect(capability.status).toBe("unsupported");
  });

  it("models a scheduled task summary for later display", () => {
    const summary: ScheduledTaskSummary = {
      id: "task-1",
      name: "nightly build",
      schedule: "0 0 * * *",
      status: "scheduled",
    };
    expect(summary.status).toBe("scheduled");
  });
});
