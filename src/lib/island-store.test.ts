import { describe, expect, it } from "vitest";

import {
  clampIslandPanel,
  ISLAND_PANEL_DEFAULT,
  ISLAND_PANEL_MAX,
  ISLAND_PANEL_MIN,
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
