import { describe, expect, it } from "vitest";
import { virtualPoolSlot } from "./virtual-pool";

const slots = (start: number, length: number) =>
  Array.from({ length }, (_, i) => virtualPoolSlot(start + i, length));

describe("virtualPoolSlot", () => {
  it("gives every row of a contiguous window its own slot", () => {
    for (const length of [1, 31, 33, 64, 256, 300, 1000]) {
      for (const start of [0, 7, 1000]) {
        expect(new Set(slots(start, length)).size).toBe(length);
      }
    }
  });

  it("keeps the slots of rows that stay visible when the window moves by one", () => {
    const before = new Map(slots(10, 40).map((slot, i) => [10 + i, slot]));
    const after = new Map(slots(11, 40).map((slot, i) => [11 + i, slot]));
    for (let index = 11; index < 50; index++) expect(after.get(index)).toBe(before.get(index));
  });

  it("keeps every slot when the window grows or shrinks", () => {
    // A remount here drops keyboard focus and open context menus.
    for (const [from, to] of [[28, 36], [60, 70], [120, 140]]) {
      for (let index = 100; index < 100 + Math.min(from, to); index++) {
        expect(virtualPoolSlot(index, to)).toBe(virtualPoolSlot(index, from));
      }
    }
  });
});
