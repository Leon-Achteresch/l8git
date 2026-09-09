import { describe, expect, it } from "vitest";

import {
  AGENT_EVENT_SCHEMA_VERSION,
  driverKind,
  instanceId,
  nativeSessionId,
  threadId,
  type AgentRuntimeEvent,
} from "@/lib/agents/types";

function parseEvent(raw: unknown): AgentRuntimeEvent {
  const event = raw as Record<string, unknown>;
  if (typeof event.schemaVersion !== "number") {
    throw new Error("protocol error: missing schemaVersion");
  }
  if (typeof event.eventId !== "string") {
    throw new Error("protocol error: missing eventId");
  }
  return raw as AgentRuntimeEvent;
}

describe("runtime event envelope", () => {
  it("carries schemaVersion, sequence and full host/instance/thread/native identity", () => {
    const event: AgentRuntimeEvent = {
      schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
      eventId: "evt-1",
      sequence: 1,
      driver: driverKind("claude"),
      instance: instanceId("claude:default"),
      threadId: threadId("t-1"),
      nativeSessionId: nativeSessionId("native-1"),
      type: "text",
      text: "hello",
    };

    expect(parseEvent(event).eventId).toBe("evt-1");
  });

  it("ignores unknown optional fields but rejects a missing required field as a protocol error", () => {
    const forwardCompatible = {
      schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
      eventId: "evt-2",
      sequence: 2,
      driver: driverKind("claude"),
      instance: instanceId("claude:default"),
      threadId: threadId("t-1"),
      nativeSessionId: nativeSessionId("native-1"),
      type: "text",
      text: "hi",
      fromFutureVersion: { some: "field" },
    };
    expect(() => parseEvent(forwardCompatible)).not.toThrow();

    const invalid = { sequence: 3, type: "text" };
    expect(() => parseEvent(invalid)).toThrow("protocol error");
  });
});
