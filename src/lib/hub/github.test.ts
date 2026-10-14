import { describe, expect, it } from "vitest";

import { rollup, starHistory } from "./github";

const DAY = 86_400_000;
const now = Date.parse("2026-10-14T12:00:00Z");
const ago = (d: number) => new Date(now - d * DAY).toISOString();

describe("starHistory", () => {
  it("builds a cumulative curve ending at the current total", () => {
    const { days, capped } = starHistory(10, [ago(40), ago(20), ago(2)], now);
    expect(days).toHaveLength(30);
    expect(days[29]).toBe(10);
    expect(days[0]).toBe(8);
    expect(capped).toBe(false);
  });

  it("flags a full sample that lies entirely inside the window", () => {
    const stamps = Array.from({ length: 100 }, (_, i) => ago(i / 10));
    expect(starHistory(500, stamps, now).capped).toBe(true);
  });
});

describe("rollup", () => {
  it("maps GitHub check states", () => {
    expect(rollup("SUCCESS")).toBe("success");
    expect(rollup("ERROR")).toBe("failure");
    expect(rollup("EXPECTED")).toBe("pending");
    expect(rollup(undefined)).toBeNull();
  });
});
