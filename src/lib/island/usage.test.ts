import { describe, expect, it } from "vitest";

import type { IslandUsageWindow } from "@/lib/island/types";
import {
  usageBarHot,
  usageResetsLabel,
  usageRingColor,
  usageRowKnown,
  usageRowsOrAll,
} from "@/lib/island/usage-format";

describe("usageRingColor", () => {
  it("maps high usage to red, mid to lime, low to teal", () => {
    expect(usageRingColor(73)).toBe("#ef4444");
    expect(usageRingColor(52)).toBe("#a3e635");
    expect(usageRingColor(21)).toBe("#2dd4bf");
  });
});

describe("usageBarHot", () => {
  it("treats half and above as hot", () => {
    expect(usageBarHot(50)).toBe(true);
    expect(usageBarHot(7)).toBe(false);
  });
});

describe("usageResetsLabel", () => {
  const windowOf = (resetsAt: number | null): IslandUsageWindow => ({
    usedPercent: 10,
    windowDurationMins: 300,
    resetsAt,
  });

  it("uses a relative label when the reset is under three hours", () => {
    const now = 1_000_000;
    const resetsAt = (now + 51 * 60_000) / 1000;
    expect(
      usageResetsLabel(windowOf(resetsAt), now, () => "nope", (mins) => `in ${mins}`),
    ).toBe("in 51");
  });

  it("falls back to an absolute label otherwise", () => {
    const now = 1_000_000;
    const resetsAt = (now + 8 * 60 * 60_000) / 1000;
    expect(
      usageResetsLabel(windowOf(resetsAt), now, () => "Thu 12:00 AM", () => "nope"),
    ).toBe("Thu 12:00 AM");
  });

  it("returns null without a reset timestamp", () => {
    expect(usageResetsLabel(windowOf(null), 0, () => "x", () => "y")).toBeNull();
  });
});

describe("usageRowKnown", () => {
  it("treats fabricated zero rows as unknown and real data as known", () => {
    const empty: IslandUsageWindow = {
      usedPercent: 0,
      windowDurationMins: null,
      resetsAt: null,
    };
    expect(usageRowKnown({ id: "claude", primary: empty, secondary: null })).toBe(false);
    expect(usageRowKnown({ id: "claude", primary: null, secondary: null })).toBe(false);
    expect(
      usageRowKnown({
        id: "claude",
        primary: { ...empty, usedPercent: 12 },
        secondary: null,
      }),
    ).toBe(true);
    expect(
      usageRowKnown({
        id: "claude",
        primary: null,
        secondary: { ...empty, resetsAt: 1_700_000_000 },
      }),
    ).toBe(true);
  });
});

describe("usageRowsOrAll", () => {
  const empty = {
    usedPercent: 0,
    windowDurationMins: null,
    resetsAt: null,
  };

  it("drops fabricated zero rows and keeps real usage", () => {
    expect(
      usageRowsOrAll([
        { id: "claude", primary: empty, secondary: null },
        { id: "codex", primary: { ...empty, usedPercent: 41 }, secondary: null },
      ]),
    ).toEqual([{ id: "codex", primary: { ...empty, usedPercent: 41 }, secondary: null }]);
  });
});
