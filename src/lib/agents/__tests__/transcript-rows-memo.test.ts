import { describe, expect, it } from "vitest";

import { batchStreamDeltas, buildTranscriptRowsMemo, type StreamDelta } from "@/lib/agents/transcript-rows";
import type { AgentItem, AgentTurn } from "@/lib/agents/types";

function buildTurns(itemCount: number): AgentTurn[] {
  const items: AgentItem[] = Array.from({ length: itemCount }, (_, index) => ({
    id: `item-${index}`,
    type: "agentMessage",
    text: `message ${index}`,
  }));
  return [{ id: "turn-1", items, status: "completed" }];
}

describe("buildTranscriptRowsMemo", () => {
  it("keeps referential equality for unchanged rows across 10000 items and rebuilds fewer than 100 rows on a small change", () => {
    const turns = buildTurns(10000);
    const cache = new Map();

    const first = buildTranscriptRowsMemo(turns, cache);
    expect(first).toHaveLength(10000);

    const second = buildTranscriptRowsMemo(turns, cache);
    let rebuilt = 0;
    for (let i = 0; i < first.length; i++) {
      if (first[i] !== second[i]) rebuilt++;
    }
    expect(rebuilt).toBe(0);

    const changedTurns: AgentTurn[] = [
      {
        ...turns[0],
        items: turns[0].items.map((item, index) =>
          index === turns[0].items.length - 1 ? { ...item, text: "updated" } : item,
        ),
      },
    ];
    const third = buildTranscriptRowsMemo(changedTurns, cache);
    let rebuiltAfterChange = 0;
    for (let i = 0; i < second.length; i++) {
      if (second[i] !== third[i]) rebuiltAfterChange++;
    }
    expect(rebuiltAfterChange).toBeGreaterThan(0);
    expect(rebuiltAfterChange).toBeLessThan(100);
  });

  it("evicts stale keys that no longer appear in the turns", () => {
    const turns = buildTurns(3);
    const cache = new Map();
    buildTranscriptRowsMemo(turns, cache);
    expect(cache.size).toBe(3);

    const shrunk: AgentTurn[] = [{ ...turns[0], items: turns[0].items.slice(0, 1) }];
    buildTranscriptRowsMemo(shrunk, cache);
    expect(cache.size).toBe(1);
  });
});

describe("batchStreamDeltas", () => {
  function delta(id: string, text: string, t: number, final = false): StreamDelta {
    return { id, text, t, final };
  }

  it("flushes the current batch before a final delta arrives", () => {
    const deltas = [delta("1", "a", 0), delta("2", "b", 10), delta("3", "done", 20, true)];
    const batches = batchStreamDeltas(deltas, { maxBatchMs: 1000, maxChars: 1000 });
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(2);
    expect(batches[1]).toEqual([delta("3", "done", 20, true)]);
  });

  it("splits a batch once maxBatchMs or maxChars is exceeded", () => {
    const deltas = [delta("1", "a", 0), delta("2", "b", 5), delta("3", "c", 200)];
    const batches = batchStreamDeltas(deltas, { maxBatchMs: 50, maxChars: 1000 });
    expect(batches).toEqual([[delta("1", "a", 0), delta("2", "b", 5)], [delta("3", "c", 200)]]);
  });

  it("keeps a delta in the same batch when it lands exactly on maxChars", () => {
    const deltas = [delta("1", "ab", 0), delta("2", "cd", 5)];
    const batches = batchStreamDeltas(deltas, { maxBatchMs: 1000, maxChars: 4 });
    expect(batches).toEqual([[delta("1", "ab", 0), delta("2", "cd", 5)]]);
  });

  it("splits into a new batch once one more character would exceed maxChars", () => {
    const deltas = [delta("1", "ab", 0), delta("2", "cde", 5)];
    const batches = batchStreamDeltas(deltas, { maxBatchMs: 1000, maxChars: 4 });
    expect(batches).toEqual([[delta("1", "ab", 0)], [delta("2", "cde", 5)]]);
  });

  it("groups a large delta stream into far fewer batches than deltas", () => {
    const deltas: StreamDelta[] = Array.from({ length: 10000 }, (_, index) => delta(`${index}`, "x", index));
    const batches = batchStreamDeltas(deltas, { maxBatchMs: 16, maxChars: 4000 });
    expect(batches.length).toBeLessThan(1000);
    expect(batches.flat()).toHaveLength(10000);
  });
});
