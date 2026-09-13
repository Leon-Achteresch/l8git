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

describe("ClaudeClient readiness", () => {
  let client: ClaudeClient;
  let sequence = 0;

  beforeEach(() => {
    vi.useFakeTimers();
    sent.length = 0;
    sequence = 0;
    client = new ClaudeClient("test-session", {
      onMessage: () => {},
      onControlRequest: () => {},
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const respondInitialize = async () => {
    await Promise.resolve();
    await Promise.resolve();
    const requestId = (sent[0] as { request_id: string }).request_id;
    handlers.onMessage(
      { type: "control_response", response: { subtype: "success", request_id: requestId, response: {} } },
      ++sequence,
    );
  };

  it("is not ready until system/init is received", async () => {
    const connectPromise = client.connect({});
    expect(client.isReady()).toBe(false);
    await respondInitialize();
    handlers.onMessage({ type: "system", subtype: "init" }, ++sequence);
    await connectPromise;
    expect(client.isReady()).toBe(true);
  });

  it("rejects sendPrompt before readiness instead of losing it silently", async () => {
    await expect(client.sendPrompt("hello")).rejects.toThrow(/nicht verbunden/u);
  });

  it("times out the handshake when system/init never arrives", async () => {
    const connectPromise = client.connect({});
    await respondInitialize();
    const assertion = expect(connectPromise).rejects.toThrow(/30s/u);
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
    expect(client.isReady()).toBe(false);
  });

  it("rejects prompts sent after transport connects but before init completes", async () => {
    const connectPromise = client.connect({});
    await Promise.resolve();
    await Promise.resolve();
    await expect(client.sendPrompt("too-early")).rejects.toThrow(/noch nicht bereit/u);
    await respondInitialize();
    handlers.onMessage({ type: "system", subtype: "init" }, ++sequence);
    await connectPromise;
  });
});
