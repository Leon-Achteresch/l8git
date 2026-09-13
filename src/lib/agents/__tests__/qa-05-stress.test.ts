import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { batchStreamDeltas, buildTranscriptRowsMemo, type StreamDelta } from "@/lib/agents/transcript-rows";
import type { AgentItem, AgentTurn } from "@/lib/agents/types";

interface MockHandlers {
  onMessage: (message: unknown, sequence: number) => void;
  onStderr: (line: string) => void;
  onExit: (code: number) => void;
}

const sent: unknown[] = [];
let handlers: MockHandlers;
let closeCalls = 0;

vi.mock("@/lib/agents/transport", () => ({
  openAgentTransport: (_provider: string, _sessionId: string, callbacks: MockHandlers) => {
    handlers = callbacks;
    return Promise.resolve({
      send: (payload: unknown) => {
        sent.push(payload);
        return Promise.resolve();
      },
      close: () => {
        closeCalls += 1;
        return Promise.resolve();
      },
    });
  },
}));

import { JsonRpcProcessClient } from "@/lib/agents/rpc-client";

function makeItem(id: string): AgentItem {
  return { id, type: "message", role: "assistant", text: `item-${id}` } as unknown as AgentItem;
}

function makeTurn(id: string, itemCount: number): AgentTurn {
  return {
    id,
    items: Array.from({ length: itemCount }, (_, index) => makeItem(`${id}-${index}`)),
    status: "completed",
  };
}

describe("QA-05 batching and memo performance", () => {
  it("batches 10k stream deltas within a bounded time", () => {
    const deltas: StreamDelta[] = Array.from({ length: 10_000 }, (_, index) => ({
      id: "stream-1",
      text: "x",
      t: index,
      final: index === 9_999,
    }));

    const started = performance.now();
    const batches = batchStreamDeltas(deltas, { maxBatchMs: 50, maxChars: 200 });
    const elapsed = performance.now() - started;

    expect(batches.flat()).toHaveLength(10_000);
    expect(elapsed).toBeLessThan(500);
  });

  it("memoizes transcript rows for 10k items within a bounded time", () => {
    const turns: AgentTurn[] = Array.from({ length: 1_000 }, (_, index) => makeTurn(`turn-${index}`, 10));
    const cache = new Map();

    const first = performance.now();
    const firstRows = buildTranscriptRowsMemo(turns, cache);
    const firstElapsed = performance.now() - first;

    const second = performance.now();
    const secondRows = buildTranscriptRowsMemo(turns, cache);
    const secondElapsed = performance.now() - second;

    expect(firstRows).toHaveLength(10_000);
    expect(secondRows).toHaveLength(10_000);
    for (let index = 0; index < firstRows.length; index += 1) {
      expect(secondRows[index]).toBe(firstRows[index]);
    }
    expect(firstElapsed).toBeLessThan(500);
    expect(secondElapsed).toBeLessThan(firstElapsed + 250);
  });
});

describe("QA-05 rpc-client sequence gaps and duplicates under load", () => {
  let client: JsonRpcProcessClient;
  let sequence = 0;
  let gapWarnings: string[];

  beforeEach(async () => {
    vi.useFakeTimers();
    sent.length = 0;
    sequence = 0;
    gapWarnings = [];
    client = new JsonRpcProcessClient("stress-session");
    await client.connect("claude");
    client.onStatus((event) => {
      if (event.type === "stderr" && /L.cke|Doppeltes/u.test(String(event.value))) {
        gapWarnings.push(String(event.value));
      }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("detects gaps and drops duplicates across a high-volume burst", () => {
    const receive = (msg: Record<string, unknown>, seq: number) => handlers.onMessage(msg, seq);

    for (let i = 1; i <= 500; i += 1) {
      sequence += 1;
      receive({ type: "assistant", text: `chunk-${i}` }, sequence);
      if (i % 50 === 0) {
        receive({ type: "assistant", text: `dup-${i}` }, sequence);
      }
    }

    sequence += 5;
    receive({ type: "assistant", text: "after-gap" }, sequence);

    expect(gapWarnings.some((line) => line.includes("Lücke"))).toBe(true);
    expect(gapWarnings.some((line) => line.includes("Doppeltes oder veraltetes JSON-Frame"))).toBe(true);
  });
});

describe("QA-05 abort/send race without zombie requests", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sent.length = 0;
    closeCalls = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects an aborted request cleanly and leaves no pending entry after parallel send+abort", async () => {
    const client = new JsonRpcProcessClient("race-session");
    await client.connect("claude");

    const controller = new AbortController();
    const requestPromise = client.request("turn", undefined, { timeoutMs: null, signal: controller.signal });
    const assertion = expect(requestPromise).rejects.toThrow();

    controller.abort();
    await assertion;

    handlers.onMessage({ id: sent.length, result: "late" }, 1);

    await client.close();
    expect(closeCalls).toBe(1);
  });

  it("does not leave dangling pending requests after the transport exits mid-flight", async () => {
    const client = new JsonRpcProcessClient("race-session-2");
    await client.connect("claude");

    const promiseA = client.request("a", undefined, { timeoutMs: null });
    const promiseB = client.request("b", undefined, { timeoutMs: null });

    const assertionA = expect(promiseA).rejects.toThrow(/beendet/u);
    const assertionB = expect(promiseB).rejects.toThrow(/beendet/u);

    handlers.onExit(1);

    await assertionA;
    await assertionB;
  });
});
