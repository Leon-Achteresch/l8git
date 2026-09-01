import { describe, expect, it } from "vitest";

import {
  clampIslandPanel,
  islandOverlayClass,
  islandPopoverSide,
  islandTarget,
  ISLAND_PANEL_DEFAULT,
  ISLAND_PANEL_MAX,
  ISLAND_PANEL_MIN,
  isEdgeDock,
  isVerticalDock,
  magnetFor,
  monitorEdgePosition,
} from "@/lib/island-store";

describe("clampIslandPanel", () => {
  it("keeps a default-sized panel unchanged", () => {
    expect(clampIslandPanel(ISLAND_PANEL_DEFAULT)).toEqual(ISLAND_PANEL_DEFAULT);
  });

  it("clamps to the min and max", () => {
    expect(clampIslandPanel({ width: 10, height: 10 })).toEqual(ISLAND_PANEL_MIN);
    expect(clampIslandPanel({ width: 9000, height: 9000 })).toEqual(ISLAND_PANEL_MAX);
  });
});

describe("island docks", () => {
  it("treats left and right as vertical", () => {
    expect(isVerticalDock("left")).toBe(true);
    expect(isVerticalDock("right")).toBe(true);
    expect(isVerticalDock("sidebar")).toBe(true);
    expect(isVerticalDock("top")).toBe(false);
    expect(isVerticalDock("header")).toBe(false);
  });

  it("opens the usage popover inward from the docked edge", () => {
    expect(islandPopoverSide("right")).toBe("left");
    expect(islandPopoverSide("left")).toBe("right");
    expect(islandPopoverSide("bottom")).toBe("top");
    expect(islandPopoverSide("top")).toBe("bottom");
  });

  it("pins the overlay transform to the docked edge", () => {
    expect(islandOverlayClass("right")).toContain("-100%");
    expect(islandOverlayClass("left")).toContain("-8px");
    expect(islandOverlayClass("header")).toContain("-18.5px");
  });

  it("snaps to the right window edge", () => {
    stubWindow(1200, 800);
    const hit = magnetFor(1160, 400);
    expect(hit?.id).toBe("right");
    expect(hit?.x).toBe(1200);
  });

  it("does not snap from the middle of the window", () => {
    stubWindow(1200, 800);
    expect(magnetFor(1100, 400)).toBeNull();
    expect(magnetFor(80, 400)).toBeNull();
  });

  it("keeps an edge-docked island on that edge", () => {
    stubWindow(1200, 800);
    expect(isEdgeDock("right")).toBe(true);
    expect(islandTarget("right", { x: 600, y: 240 })).toEqual({ x: 1200, y: 240 });
    expect(islandTarget("top", { x: 400, y: 20 })).toEqual({ x: 400, y: 0 });
  });

  it("prefers a nearby window edge over in-app slots", () => {
    stubWindow(1200, 800);
    expect(magnetFor(20, 400)?.id).toBe("left");
    expect(magnetFor(1180, 400)?.id).toBe("right");
  });

  it("places a window on the monitor work area edge", () => {
    expect(
      monitorEdgePosition(
        "right",
        { x: 0, y: 25, width: 1440, height: 875 },
        { width: 80, height: 120 },
        { x: 700, y: 300 },
      ),
    ).toEqual({ x: 1360, y: 300 });
    expect(
      monitorEdgePosition(
        "top",
        { x: 0, y: 25, width: 1440, height: 875 },
        { width: 80, height: 40 },
        { x: 200, y: 10 },
      ),
    ).toEqual({ x: 200, y: 25 });
  });
});

function stubWindow(innerWidth: number, innerHeight: number) {
  (globalThis as { window: { innerWidth: number; innerHeight: number } }).window = {
    innerWidth,
    innerHeight,
  };
}