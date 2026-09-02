import { describe, expect, it } from "vitest";

import {
  clampIslandPanel,
  edgeNear,
  edgePosition,
  ISLAND_PANEL_DEFAULT,
  ISLAND_PANEL_MAX,
  ISLAND_PANEL_MIN,
  isVerticalEdge,
  magnetFor,
} from "@/lib/island-store";

const WORK = { x: 0, y: 25, width: 1440, height: 875 };

describe("clampIslandPanel", () => {
  it("keeps a default-sized panel unchanged", () => {
    expect(clampIslandPanel(ISLAND_PANEL_DEFAULT)).toEqual(ISLAND_PANEL_DEFAULT);
  });

  it("clamps to the min and max", () => {
    expect(clampIslandPanel({ width: 10, height: 10 })).toEqual(ISLAND_PANEL_MIN);
    expect(clampIslandPanel({ width: 9000, height: 9000 })).toEqual(ISLAND_PANEL_MAX);
  });
});

describe("in-app docks", () => {
  it("does not snap without registered slots", () => {
    expect(magnetFor(600, 400)).toBeNull();
  });
});

describe("screen edges", () => {
  it("treats left and right as vertical", () => {
    expect(isVerticalEdge("left")).toBe(true);
    expect(isVerticalEdge("right")).toBe(true);
    expect(isVerticalEdge("top")).toBe(false);
    expect(isVerticalEdge(null)).toBe(false);
  });

  it("finds the nearest edge within reach", () => {
    expect(edgeNear(WORK, { x: 1350, y: 300, width: 80, height: 120 })).toBe("right");
    expect(edgeNear(WORK, { x: 10, y: 300, width: 80, height: 120 })).toBe("left");
    expect(edgeNear(WORK, { x: 200, y: 30, width: 80, height: 40 })).toBe("top");
    expect(edgeNear(WORK, { x: 600, y: 400, width: 80, height: 120 })).toBeNull();
  });

  it("prefers the closer edge in a corner", () => {
    expect(edgeNear(WORK, { x: 5, y: 40, width: 80, height: 40 })).toBe("left");
  });

  it("pins the window to the work area edge", () => {
    expect(edgePosition("right", WORK, { x: 1350, y: 300, width: 80, height: 120 })).toEqual({ x: 1360, y: 300 });
    expect(edgePosition("top", WORK, { x: 200, y: 10, width: 80, height: 40 })).toEqual({ x: 200, y: 25 });
    expect(edgePosition(null, WORK, { x: -30, y: 2000, width: 80, height: 40 })).toEqual({ x: 0, y: 860 });
  });
});
