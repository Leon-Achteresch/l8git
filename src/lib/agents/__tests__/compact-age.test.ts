import { describe, expect, it } from "vitest";

import { compactAge } from "@/lib/agents/compact-age";

const NOW = Date.parse("2026-09-02T16:33:00Z");

function ago(ms: number): number {
  return Math.floor((NOW - ms) / 1000);
}

describe("compactAge", () => {
  it("renders minutes, hours with remainder, and days", () => {
    expect(compactAge(ago(3 * 60_000), "en", NOW)).toBe("3m");
    expect(compactAge(ago(22 * 60_000), "en", NOW)).toBe("22m");
    expect(compactAge(ago(7 * 3_600_000 + 59 * 60_000), "en", NOW)).toBe("7h 59m");
    expect(compactAge(ago(8 * 3_600_000), "en", NOW)).toBe("8h");
    expect(compactAge(ago(2 * 86_400_000), "en", NOW)).toBe("2d");
  });

  it("floors sub-minute ages to 1m", () => {
    expect(compactAge(ago(12_000), "en", NOW)).toBe("1m");
  });

  it("falls back to a short date after a week", () => {
    expect(compactAge(ago(30 * 86_400_000), "en", NOW)).toMatch(/Aug/);
  });
});
