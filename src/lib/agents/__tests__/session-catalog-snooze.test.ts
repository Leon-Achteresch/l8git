import { describe, expect, it } from "vitest";

import {
  settleThread,
  snoozeThread,
  sortThreadEntries,
  type SnoozableThreadSummary,
} from "@/lib/agents/session-catalog";
import type { AgentThreadSummary } from "@/lib/agents/types";

function thread(id: string, overrides: Partial<SnoozableThreadSummary> = {}): SnoozableThreadSummary {
  return {
    id,
    path: "/repo",
    title: id,
    preview: "",
    createdAt: 0,
    updatedAt: 0,
    status: "idle",
    modelProvider: "anthropic",
    ...overrides,
  };
}

describe("session catalog snooze and settle", () => {
  it("sorts pinned above active above snoozed", () => {
    const now = 1_000_000;
    const threads: SnoozableThreadSummary[] = [
      thread("snoozed", { snoozedUntil: now + 1000, updatedAt: 5 }),
      thread("active", { updatedAt: 3 }),
      thread("pinned", { isPinned: true, updatedAt: 1 }),
    ];
    const sorted = sortThreadEntries(threads, now);
    expect(sorted.map((t) => t.id)).toEqual(["pinned", "active", "snoozed"]);
  });

  it("treats an expired snooze as active again", () => {
    const now = 2000;
    const threads: SnoozableThreadSummary[] = [
      thread("expired-snooze", { snoozedUntil: 1000, updatedAt: 5 }),
      thread("active", { updatedAt: 1 }),
    ];
    const sorted = sortThreadEntries(threads, now);
    expect(sorted.map((t) => t.id)).toEqual(["expired-snooze", "active"]);
  });

  it("sorts settled threads below active and snoozed (DETAIL-08)", () => {
    const now = 1_000_000;
    const threads: SnoozableThreadSummary[] = [
      thread("settled", { settled: true, updatedAt: 9 }),
      thread("snoozed", { snoozedUntil: now + 1000, updatedAt: 5 }),
      thread("active", { updatedAt: 3 }),
      thread("pinned", { isPinned: true, updatedAt: 1 }),
    ];
    const sorted = sortThreadEntries(threads, now);
    expect(sorted.map((t) => t.id)).toEqual(["pinned", "active", "snoozed", "settled"]);
  });

  it("snoozeThread sets snoozedUntil and settleThread clears it", () => {
    const byPath: Record<string, AgentThreadSummary[]> = { "/repo": [thread("t1")] };
    const snoozed = snoozeThread(byPath, "/repo", "t1", 5000);
    expect((snoozed["/repo"][0] as SnoozableThreadSummary).snoozedUntil).toBe(5000);

    const settled = settleThread(snoozed, "/repo", "t1", true);
    const result = settled["/repo"][0] as SnoozableThreadSummary;
    expect(result.settled).toBe(true);
    expect(result.snoozedUntil).toBeNull();
  });
});
