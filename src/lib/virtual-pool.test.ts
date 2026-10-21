import { describe, expect, it } from "vitest";
import { assignPoolSlots } from "./virtual-pool";

const range = (start: number, length: number) =>
  Array.from({ length }, (_, i) => start + i);

/** DOM moves React makes for keyed children going from one slot order to the next. */
function reactMoves(before: Map<number, number>, after: Map<number, number>): number[] {
  const oldIndex = new Map([...before.values()].map((slot, i) => [slot, i]));
  const moved: number[] = [];
  let lastPlaced = 0;
  for (const slot of after.values()) {
    const index = oldIndex.get(slot);
    if (index === undefined) continue;
    if (index < lastPlaced) moved.push(slot);
    else lastPlaced = index;
  }
  return moved;
}

describe("assignPoolSlots", () => {
  it("gives every row of a window its own slot", () => {
    for (const length of [1, 31, 64, 300]) {
      const slots = assignPoolSlots(new Map(), range(1000, length));
      expect(new Set(slots.values()).size).toBe(length);
      expect(Math.max(...slots.values())).toBe(length - 1);
    }
  });

  it("hands the slots of rows leaving the top to rows entering the bottom", () => {
    const before = assignPoolSlots(new Map(), range(10, 40));
    const after = assignPoolSlots(before, range(13, 40));
    for (const index of range(13, 37)) expect(after.get(index)).toBe(before.get(index));
    expect([50, 51, 52].map((i) => after.get(i))).toEqual([10, 11, 12].map((i) => before.get(i)));
    // Only the reused nodes move, never a row that stayed.
    expect(reactMoves(before, after).sort()).toEqual([10, 11, 12].map((i) => before.get(i)).sort());
  });

  it("never moves staying rows when rows enter at the top", () => {
    const before = assignPoolSlots(new Map(), range(10, 40));
    const after = assignPoolSlots(before, range(7, 40));
    for (const index of range(10, 37)) expect(after.get(index)).toBe(before.get(index));
    expect(reactMoves(before, after)).toEqual([]);
    expect(new Set(after.values()).size).toBe(40);
  });

  it("updates every node in place when the window jumps to unrelated rows", () => {
    const before = assignPoolSlots(new Map(), range(0, 40));
    const after = assignPoolSlots(before, range(5000, 40));
    expect([...after.values()]).toEqual([...before.values()]);
    expect(reactMoves(before, after)).toEqual([]);
  });

  it("keeps every slot when the window grows or shrinks", () => {
    // A remount here drops keyboard focus and open context menus.
    for (const [from, to] of [[28, 36], [60, 70], [140, 120]]) {
      const before = assignPoolSlots(new Map(), range(100, from));
      const after = assignPoolSlots(before, range(100, to));
      for (const index of range(100, Math.min(from, to))) expect(after.get(index)).toBe(before.get(index));
      expect(new Set(after.values()).size).toBe(to);
    }
  });

  it("stays bounded while scrolling back and forth", () => {
    let slots = assignPoolSlots(new Map(), range(0, 40));
    for (let step = 0; step < 200; step++) {
      slots = assignPoolSlots(slots, range(Math.abs((step % 40) - 20) * 3, 40));
      expect(Math.max(...slots.values())).toBeLessThan(80);
    }
  });
});
