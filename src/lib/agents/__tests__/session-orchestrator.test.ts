import { describe, expect, it } from "vitest";

import { AgentSessionOrchestrator } from "@/lib/agents/session-manager";
import {
  AGENT_EVENT_SCHEMA_VERSION,
  driverKind,
  instanceId,
  nativeSessionId,
  threadId,
  type AgentProviderAdapter,
  type AgentRuntimeEvent,
} from "@/lib/agents/types";

function makeAdapter(driver: string): AgentProviderAdapter {
  return {
    driver: driverKind(driver),
    start: async (instance) => ({
      driver: driverKind(driver),
      instance,
      nativeSessionId: nativeSessionId(`native-${driver}`),
    }),
    send: async () => {},
    interrupt: async () => {},
    stop: async () => {},
    resume: async () => {},
    capability: () => ({ status: "supported" }),
  };
}

function textEvent(driver: string, thread: string): AgentRuntimeEvent {
  return {
    schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
    eventId: `evt-${driver}-${thread}`,
    sequence: 1,
    driver: driverKind(driver),
    instance: instanceId(`${driver}:default`),
    threadId: threadId(thread),
    nativeSessionId: nativeSessionId(`native-${driver}`),
    type: "session",
    status: "ready",
  };
}

describe("AgentSessionOrchestrator", () => {
  it("keeps threads from different drivers isolated in projections", () => {
    const orchestrator = new AgentSessionOrchestrator();
    orchestrator.registerAdapter(makeAdapter("codex"));
    orchestrator.registerAdapter(makeAdapter("claude"));

    orchestrator.ingest(textEvent("codex", "t-codex"));
    orchestrator.ingest(textEvent("claude", "t-claude"));

    const projections = orchestrator.projections();
    expect(projections.size).toBe(2);
    expect(projections.get(threadId("t-codex"))?.driver).toBe(driverKind("codex"));
    expect(projections.get(threadId("t-claude"))?.driver).toBe(driverKind("claude"));
  });

  it("a failing thread does not affect commands dispatched to another driver's thread", async () => {
    const orchestrator = new AgentSessionOrchestrator();
    const failing: AgentProviderAdapter = {
      ...makeAdapter("codex"),
      send: async () => {
        throw new Error("boom");
      },
    };
    orchestrator.registerAdapter(failing);
    orchestrator.registerAdapter(makeAdapter("claude"));

    orchestrator.ingest(textEvent("codex", "t-codex"));
    orchestrator.ingest(textEvent("claude", "t-claude"));

    await expect(
      orchestrator.dispatch({ type: "send", threadId: threadId("t-codex"), text: "hi" }),
    ).rejects.toThrow("boom");

    await expect(
      orchestrator.dispatch({ type: "send", threadId: threadId("t-claude"), text: "hi" }),
    ).resolves.toBeUndefined();
  });
});
