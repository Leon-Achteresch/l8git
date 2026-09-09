import { beforeEach, describe, expect, it } from "vitest";

import { installTestPlatform } from "@/lib/agents/__tests__/platform-harness";
import { agentSessionOrchestrator, registerBuiltInAdapters } from "@/lib/agents/session-manager";
import { ClaudeProviderAdapter } from "@/lib/agents/providers/claude/client";
import { CodexProviderAdapter } from "@/lib/agents/providers/codex/client";
import { CursorProviderAdapter } from "@/lib/agents/providers/cursor/client";
import { OpenCodeProviderAdapter } from "@/lib/agents/providers/opencode/client";
import { driverKind, instanceId, threadId } from "@/lib/agents/types";
import { agentProvider } from "@/lib/agents/provider-registry";

describe("PROV-10 adapter migration", () => {
  beforeEach(async () => {
    installTestPlatform();
    await registerBuiltInAdapters();
  });

  it("registers a thin adapter for every existing chat driver at module load", async () => {
    for (const driver of ["claude", "codex", "cursor", "opencode"]) {
      try {
        await agentSessionOrchestrator.dispatch({
          type: "start",
          driver: driverKind(driver),
          instance: instanceId(`${driver}:default`),
        });
      } catch (error) {
        expect(String(error)).not.toContain(`No adapter registered for driver ${driver}`);
      }
    }
  });

  it("keeps each adapter's capability matrix aligned with the provider registry", () => {
    const adapters = [
      new ClaudeProviderAdapter(),
      new CodexProviderAdapter(),
      new CursorProviderAdapter(),
      new OpenCodeProviderAdapter(),
    ];
    for (const adapter of adapters) {
      const meta = agentProvider(adapter.driver);
      expect(meta).toBeDefined();
      for (const [capability, expected] of Object.entries(meta!.capabilities)) {
        const status = adapter.capability(capability).status;
        expect(status === "supported").toBe(expected);
      }
    }
  });

  it("rejects thread commands for a driver with no registered session instead of silently no-oping", async () => {
    await expect(
      agentSessionOrchestrator.dispatch({ type: "send", threadId: threadId("unknown-thread"), text: "hi" }),
    ).rejects.toThrow("No adapter available for thread");
  });
});
