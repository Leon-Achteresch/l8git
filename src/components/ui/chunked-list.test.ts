import { describe, expect, it } from "vitest";
import { assignChunks } from "./chunked-list";

describe("assignChunks", () => {
  const ids = () => { let n = 0; return () => n++; };
  const keys = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => `r${from + i}`);

  it("keeps rows in their chunk when a row is added or removed before them", () => {
    const newId = ids();
    let previous: ReadonlyMap<string | number, number> = new Map();
    const run = (k: string[]) => {
      const result = assignChunks(k, previous, newId);
      previous = result.membership;
      return result.chunks;
    };
    expect(run(keys(0, 60)).map((c) => c.keys.length)).toEqual([25, 25, 10]);
    const chunkOf = (k: string) => previous.get(k);
    const before = keys(0, 60).map(chunkOf);

    // A new row at the top joins nothing old; every existing row keeps its chunk.
    run(["new", ...keys(0, 60)]);
    expect(keys(0, 60).map(chunkOf)).toEqual(before);

    // Removing the first row of a chunk keeps the rest of that chunk together.
    run(["new", ...keys(0, 25), ...keys(26, 60)]);
    expect(keys(26, 60).map(chunkOf)).toEqual(before.slice(26));
  });

  it("does not mutate the previous membership", () => {
    const previous = new Map<string | number, number>([["a", 7]]);
    assignChunks(["a", "b"], previous, ids());
    expect([...previous]).toEqual([["a", 7]]);
  });
});
