import { describe, expect, it } from "vitest";

import {
  driverKind,
  instanceId,
  nativeSessionId,
  threadId,
  type AgentCapability,
  type AgentProviderAdapter,
} from "@/lib/agents/types";

function makeMinimalAdapter(): AgentProviderAdapter {
  return {
    driver: driverKind("fixture"),
    async start(instance) {
      return { driver: driverKind("fixture"), instance, nativeSessionId: nativeSessionId("native-1") };
    },
    async send() {},
    async interrupt() {},
    async stop() {},
    async resume() {},
    capability(name): AgentCapability {
      if (name === "images") return { status: "unsupported", reason: "not implemented" };
      return { status: "unavailable", reason: "unknown capability" };
    },
  };
}

describe("AgentProviderAdapter contract", () => {
  it("lets a minimal adapter satisfy start/send/interrupt/stop/resume without provider-specific types", async () => {
    const adapter = makeMinimalAdapter();
    const ref = await adapter.start(instanceId("fixture:default"));
    expect(ref.nativeSessionId).toBe("native-1");
    await adapter.send(threadId("t-1"), "hi");
    await adapter.interrupt(threadId("t-1"));
    await adapter.stop(threadId("t-1"));
    await adapter.resume(threadId("t-1"), ref);
    expect(adapter.capability("images").status).toBe("unsupported");
    expect(adapter.capability("mystery").status).toBe("unavailable");
    expect(adapter.steer).toBeUndefined();
  });
});
