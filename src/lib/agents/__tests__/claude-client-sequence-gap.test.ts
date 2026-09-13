import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface MockHandlers {
  onMessage: (message: unknown, sequence: number) => void;
  onStderr: (line: string) => void;
  onExit: (code: number) => void;
}

const sent: unknown[] = [];
let handlers: MockHandlers;

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

import { ClaudeClient } from "@/lib/agents/providers/claude/client";

describe("ClaudeClient sequence handling", () => {
  let client: ClaudeClient;
  let received: Record<string, unknown>[];
  let gaps: Array<{ expected: number; received: number }>;
  let sequence = 0;

  beforeEach(async () => {
    vi.useFakeTimers();
    sent.length = 0;
    sequence = 0;
    received = [];
    gaps = [];
    client = new ClaudeClient("test-session", {
      onMessage: (message) => received.push(message),
      onControlRequest: () => {},
      onSequenceGap: (info) => gaps.push(info),
    });
    const connectPromise = client.connect({});
    await Promise.resolve();
    await Promise.resolve();
    const requestId = (sent[0] as { request_id: string }).request_id;
    handlers.onMessage(
      { type: "control_response", response: { subtype: "success", request_id: requestId, response: {} } },
      ++sequence,
    );
    handlers.onMessage({ type: "system", subtype: "init" }, ++sequence);
    await connectPromise;
    received.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("deduplicates a replayed event with the same sequence number", () => {
    handlers.onMessage({ type: "assistant", text: "hi", id: "evt-1" }, sequence + 1);
    handlers.onMessage({ type: "assistant", text: "hi", id: "evt-1" }, sequence + 1);
    expect(received).toHaveLength(1);
  });

  it("reports a detected gap in the event sequence", () => {
    handlers.onMessage({ type: "assistant", text: "a" }, sequence + 1);
    handlers.onMessage({ type: "assistant", text: "c" }, sequence + 3);
    expect(gaps).toEqual([{ expected: sequence + 2, received: sequence + 3 }]);
    expect(received).toHaveLength(2);
  });

  it("drops an out-of-order stale frame without surfacing it as new", () => {
    handlers.onMessage({ type: "assistant", text: "b" }, sequence + 2);
    handlers.onMessage({ type: "assistant", text: "a-stale" }, sequence + 1);
    expect(received).toEqual([{ type: "assistant", text: "b" }]);
  });
});
