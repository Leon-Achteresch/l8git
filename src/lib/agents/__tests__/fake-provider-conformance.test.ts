import { describe, expect, it } from "vitest";

import { FakeProviderAdapter } from "@/lib/agents/providers/fake/client";
import { instanceId, threadId, type AgentProviderAdapter } from "@/lib/agents/types";

const UNKNOWN_THREAD = threadId("thread-never-started");

const FULL_MATRIX = { history: true, approvals: true, models: true, images: true, tools: true };
const MINIMAL_MATRIX = { history: true, approvals: false, models: false, images: false, tools: false };

const drivers: Array<{ name: string; matrix: typeof FULL_MATRIX; make: () => AgentProviderAdapter }> = [
  { name: "fake-full", matrix: FULL_MATRIX, make: () => FakeProviderAdapter.preset("full") },
  { name: "fake-minimal", matrix: MINIMAL_MATRIX, make: () => FakeProviderAdapter.preset("minimal") },
];

describe("fake provider adapter conformance", () => {
  it("registers and runs against the shared AgentProviderAdapter interface without touching session-manager or chat-store code", async () => {
    const adapter: AgentProviderAdapter = FakeProviderAdapter.preset("full");
    const ref = await adapter.start(instanceId("/tmp/fake-repo"));
    expect(ref.driver).toBe("fake");
    const thread = threadId(String(ref.nativeSessionId));
    await adapter.send(thread, "hi");
    await adapter.stop(thread);
  });

  for (const { name, matrix, make } of drivers) {
    it(`${name}: capability() matches its declared matrix with a reason for anything unsupported`, () => {
      const adapter = make();
      for (const [capability, expected] of Object.entries(matrix)) {
        const result = adapter.capability(capability);
        expect(result.status === "supported").toBe(expected);
        if (result.status !== "supported") {
          expect(result.reason, `${name}.${capability} needs a reason`).toBeTruthy();
        }
      }
    });

    it(`${name}: capability() rejects unknown capability names`, () => {
      const adapter = make();
      const result = adapter.capability("does-not-exist");
      expect(result.status).not.toBe("supported");
      expect(result.reason).toBeTruthy();
    });

    it(`${name}: stop() on an unknown thread does not throw`, async () => {
      const adapter = make();
      await expect(adapter.stop(UNKNOWN_THREAD)).resolves.toBeUndefined();
    });

    it(`${name}: interrupt() on an unknown thread throws`, async () => {
      const adapter = make();
      await expect(adapter.interrupt(UNKNOWN_THREAD)).rejects.toThrow();
    });

    it(`${name}: send() rejects an unknown thread instead of silently dropping the message`, async () => {
      const adapter = make();
      await expect(adapter.send(UNKNOWN_THREAD, "hi")).rejects.toThrow();
    });
  }

  it("full preset exposes steer(), minimal preset omits it entirely", () => {
    const full = FakeProviderAdapter.preset("full");
    const minimal = FakeProviderAdapter.preset("minimal");
    expect(typeof full.steer).toBe("function");
    expect(minimal.steer).toBeUndefined();
  });

  it("plays back fixture events on send()", async () => {
    const seen: string[] = [];
    const adapter = FakeProviderAdapter.preset("full", { onEvent: (event) => seen.push(event.type) });
    const ref = await adapter.start(instanceId("/tmp/fake-repo"));
    await adapter.send(threadId(String(ref.nativeSessionId)), "hi");
    expect(seen).toEqual(["text", "tool", "text", "usage", "turn-completed"]);
  });
});
