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
      send: (payload: unknown) => {
        sent.push(payload);
        return Promise.resolve();
      },
      close: () => Promise.resolve(),
    });
  },
}));

import { JsonRpcProcessClient } from "@/lib/agents/rpc-client";

describe("JsonRpcProcessClient", () => {
  let client: JsonRpcProcessClient;
  let sequence = 0;

  beforeEach(async () => {
    vi.useFakeTimers();
    sent.length = 0;
    sequence = 0;
    client = new JsonRpcProcessClient("test-session");
    await client.connect("codex");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const receive = (message: Record<string, unknown>) => handlers.onMessage(message, ++sequence);

  it("resolves a request with the matching response", async () => {
    const promise = client.request("ping", { value: 1 });
    receive({ id: 1, result: { pong: true } });
    await expect(promise).resolves.toEqual({ pong: true });
    expect(sent[0]).toEqual({ method: "ping", id: 1, params: { value: 1 } });
  });

  it("rejects a request after the default timeout", async () => {
    const promise = client.request("slow");
    const assertion = expect(promise).rejects.toThrow(/Zeitlimit/u);
    vi.advanceTimersByTime(120_000);
    await assertion;
  });

  it("never times out when timeoutMs is null", async () => {
    const promise = client.request("turn", undefined, { timeoutMs: null });
    vi.advanceTimersByTime(3_600_000);
    receive({ id: 1, result: "done" });
    await expect(promise).resolves.toBe("done");
  });

  it("rejects pending requests when the process exits", async () => {
    const promise = client.request("turn", undefined, { timeoutMs: null });
    const assertion = expect(promise).rejects.toThrow(/beendet/u);
    handlers.onExit(1);
    await assertion;
  });

  it("rejects with the rpc error message", async () => {
    const promise = client.request("bad");
    receive({ id: 1, error: { code: -32000, message: "nope" } });
    await expect(promise).rejects.toThrow("nope");
  });

  it("drops stale frames by sequence", async () => {
    const promise = client.request("ping");
    handlers.onMessage({ id: 1, result: "stale" }, 0);
    receive({ id: 1, result: "fresh" });
    await expect(promise).resolves.toBe("fresh");
  });
});
