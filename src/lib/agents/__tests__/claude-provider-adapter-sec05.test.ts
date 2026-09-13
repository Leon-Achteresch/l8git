import { beforeEach, describe, expect, it, vi } from "vitest";

interface MockHandlers {
  onMessage: (message: unknown, sequence: number) => void;
  onStderr: (line: string) => void;
  onExit: (code: number) => void;
}

const sent: unknown[] = [];
let handlers: MockHandlers;
let sequence = 0;

vi.mock("@/lib/agents/transport", () => ({
  openAgentTransport: (_provider: string, _sessionId: string, callbacks: MockHandlers) => {
    handlers = callbacks;
    return Promise.resolve({
      id: 1,
      sessionId: "test-session",
      send: (payload: unknown) => {
        sent.push(payload);
        return Promise.resolve();
      },
      close: () => Promise.resolve(),
    });
  },
}));

import { ClaudeProviderAdapter } from "@/lib/agents/providers/claude/client";
import { driverKind, instanceId } from "@/lib/agents/types";

describe("SEC-05: ClaudeProviderAdapter rejects unhandled control requests", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sent.length = 0;
    sequence = 0;
  });

  it("responds with an explicit error instead of silently dropping an unknown control_request outside the chat session", async () => {
    const adapter = new ClaudeProviderAdapter();
    const startPromise = adapter.start(instanceId("default"));

    await Promise.resolve();
    await Promise.resolve();
    const initRequestId = (sent[0] as { request_id: string }).request_id;
    handlers.onMessage(
      { type: "control_response", response: { subtype: "success", request_id: initRequestId, response: {} } },
      ++sequence,
    );
    handlers.onMessage({ type: "system", subtype: "init" }, ++sequence);
    await startPromise;

    sent.length = 0;
    handlers.onMessage(
      {
        type: "control_request",
        request_id: "req-unknown-1",
        request: { subtype: "some_unsupported_subtype" },
      },
      ++sequence,
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(sent).toHaveLength(1);
    const response = sent[0] as {
      type: string;
      response: { subtype: string; request_id: string; error?: string };
    };
    expect(response.type).toBe("control_response");
    expect(response.response.subtype).toBe("error");
    expect(response.response.request_id).toBe("req-unknown-1");
    expect(response.response.error).toMatch(/some_unsupported_subtype/u);
  });

  it("exposes the claude driver kind", () => {
    const adapter = new ClaudeProviderAdapter();
    expect(adapter.driver).toBe(driverKind("claude"));
  });
});
