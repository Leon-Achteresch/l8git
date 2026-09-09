import { describe, expect, it } from "vitest";

import { agentProvider } from "@/lib/agents/provider-registry";
import { ClaudeProviderAdapter } from "@/lib/agents/providers/claude/client";
import { CodexProviderAdapter } from "@/lib/agents/providers/codex/client";
import { CursorProviderAdapter } from "@/lib/agents/providers/cursor/client";
import { OpenCodeProviderAdapter } from "@/lib/agents/providers/opencode/client";
import { threadId, type AgentProviderAdapter } from "@/lib/agents/types";

const UNKNOWN_THREAD = threadId("thread-never-started");

const adapters: Array<{ name: string; make: () => AgentProviderAdapter; throwsOnInterrupt: boolean }> = [
  { name: "claude", make: () => new ClaudeProviderAdapter(), throwsOnInterrupt: true },
  { name: "codex", make: () => new CodexProviderAdapter(), throwsOnInterrupt: true },
  { name: "cursor", make: () => new CursorProviderAdapter(), throwsOnInterrupt: false },
  { name: "opencode", make: () => new OpenCodeProviderAdapter(), throwsOnInterrupt: false },
];

const REQUIRES_KNOWN_THREAD: Array<{ name: string; make: () => AgentProviderAdapter }> = [
  { name: "claude", make: () => new ClaudeProviderAdapter() },
  { name: "codex", make: () => new CodexProviderAdapter() },
  { name: "opencode", make: () => new OpenCodeProviderAdapter() },
];

describe("provider adapter conformance", () => {
  for (const { name, make } of adapters) {
    it(`${name}: capability() covers the full registry matrix with a reason for anything not supported`, () => {
      const adapter = make();
      const meta = agentProvider(name);
      expect(meta).toBeDefined();
      for (const [capability, expected] of Object.entries(meta!.capabilities)) {
        const result = adapter.capability(capability);
        expect(result.status === "supported").toBe(expected);
        if (result.status !== "supported") {
          expect(result.reason, `${name}.${capability} needs a reason`).toBeTruthy();
        }
      }
    });

    it(`${name}: capability() rejects unknown capability names instead of pretending they are supported`, () => {
      const adapter = make();
      const result = adapter.capability("does-not-exist");
      expect(result.status).not.toBe("supported");
      expect(result.reason).toBeTruthy();
    });

    it(`${name}: stop() on an unknown thread does not throw`, async () => {
      const adapter = make();
      await expect(adapter.stop(UNKNOWN_THREAD)).resolves.toBeUndefined();
    });
  }

  for (const { name, make, throwsOnInterrupt } of adapters) {
    it(`${name}: interrupt() on an unknown thread ${throwsOnInterrupt ? "throws" : "resolves without a native session"}`, async () => {
      const adapter = make();
      if (throwsOnInterrupt) {
        await expect(adapter.interrupt(UNKNOWN_THREAD)).rejects.toThrow();
      } else {
        await expect(adapter.interrupt(UNKNOWN_THREAD)).resolves.toBeUndefined();
      }
    });
  }

  for (const { name, make } of REQUIRES_KNOWN_THREAD) {
    it(`${name}: send() rejects an unknown thread instead of silently dropping the message`, async () => {
      const adapter = make();
      await expect(adapter.send(UNKNOWN_THREAD, "hi")).rejects.toThrow();
    });
  }
});
