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

describe("ClaudeClient control requests", () => {
  let client: ClaudeClient;
  let sequence = 0;

  const respondInitialize = async () => {
    await Promise.resolve();
    await Promise.resolve();
    const requestId = (sent[0] as { request_id: string }).request_id;
    handlers.onMessage(
      { type: "control_response", response: { subtype: "success", request_id: requestId, response: {} } },
      ++sequence,
    );
    handlers.onMessage({ type: "system", subtype: "init" }, ++sequence);
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    sent.length = 0;
    sequence = 0;
    client = new ClaudeClient("test-session", {
      onMessage: () => {},
      onControlRequest: () => {},
    });
    const connectPromise = client.connect({});
    await respondInitialize();
    await connectPromise;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("times out a control request that never receives a response", async () => {
    const promise = client.setModel("opus");
    const assertion = expect(promise).rejects.toThrow(/Zeitlimit/u);
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });

  it("rejects a control request when aborted", async () => {
    const controller = new AbortController();
    const promise = client.request("mcp_status", {}, { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toThrow(/abgebrochen/u);
  });

  it("rejects all pending control requests on close", async () => {
    const promise = client.setPermissionMode("plan");
    const closePromise = client.close();
    await expect(promise).rejects.toThrow(/geschlossen/u);
    await closePromise;
  });

  it("rejects pending control requests when the process exits", async () => {
    const promise = client.setMaxThinkingTokens(1024);
    const assertion = expect(promise).rejects.toThrow(/beendet/u);
    handlers.onExit(1);
    await assertion;
  });

  it("ignores a late response for an already-resolved request id and does not resolve twice", async () => {
    const requestIndex = sent.length;
    const promise = client.rename("first title");
    const requestId = (sent[requestIndex] as { request_id: string }).request_id;
    handlers.onMessage(
      { type: "control_response", response: { subtype: "success", request_id: requestId, response: "ok" } },
      ++sequence,
    );
    await expect(promise).resolves.toBe("ok");
    expect(() =>
      handlers.onMessage(
        { type: "control_response", response: { subtype: "success", request_id: requestId, response: "again" } },
        ++sequence,
      ),
    ).not.toThrow();
  });

  it("does not throw for a control_response with an unknown request id", () => {
    expect(() =>
      handlers.onMessage(
        { type: "control_response", response: { subtype: "success", request_id: "unknown", response: "x" } },
        ++sequence,
      ),
    ).not.toThrow();
  });
});
