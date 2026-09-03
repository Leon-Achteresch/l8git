import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { flattenThreads, groupOf, type SidebarThread } from "@/lib/agents/thread-grouping";

const NOW = new Date("2026-03-12T15:30:00Z");
const startOfToday = (() => {
  const start = new Date(NOW);
  start.setHours(0, 0, 0, 0);
  return start.getTime();
})();

function thread(overrides: Partial<SidebarThread> & { id: string }): SidebarThread {
  return {
    provider: "codex",
    path: "/repo",
    title: overrides.id,
    preview: "",
    status: "idle",
    updatedAt: Math.floor(NOW.getTime() / 1000),
    archived: false,
    isPinned: false,
    ...overrides,
  } as SidebarThread;
}

function secondsAgo(ms: number): number {
  return Math.floor((NOW.getTime() - ms) / 1000);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("groupOf", () => {
  it("puts pinned threads in their own group regardless of age", () => {
    const old = thread({ id: "a", isPinned: true, updatedAt: secondsAgo(90 * 86_400_000) });
    expect(groupOf(old, startOfToday)).toBe("pinned");
  });

  it("buckets by recency", () => {
    expect(groupOf(thread({ id: "t", updatedAt: secondsAgo(60_000) }), startOfToday)).toBe("today");
    expect(groupOf(thread({ id: "y", updatedAt: secondsAgo(20 * 3_600_000) }), startOfToday)).toBe(
      "yesterday",
    );
    expect(groupOf(thread({ id: "w", updatedAt: secondsAgo(3 * 86_400_000) }), startOfToday)).toBe(
      "last7Days",
    );
    expect(groupOf(thread({ id: "o", updatedAt: secondsAgo(30 * 86_400_000) }), startOfToday)).toBe(
      "older",
    );
  });
});

describe("flattenThreads", () => {
  it("emits a header before each non-empty group, in display order", () => {
    const items = flattenThreads([
      thread({ id: "pin", isPinned: true }),
      thread({ id: "now" }),
      thread({ id: "old", updatedAt: secondsAgo(30 * 86_400_000) }),
    ]);
    expect(items.map((item) => (item.kind === "header" ? `#${item.group}` : item.key))).toEqual([
      "#pinned",
      "codex:/repo:pin",
      "#today",
      "codex:/repo:now",
      "#older",
      "codex:/repo:old",
    ]);
  });

  it("omits headers for groups with no threads", () => {
    const items = flattenThreads([thread({ id: "now" })]);
    expect(items.filter((item) => item.kind === "header")).toHaveLength(1);
  });

  it("keeps every thread exactly once", () => {
    const input = [
      thread({ id: "a" }),
      thread({ id: "b", updatedAt: secondsAgo(20 * 3_600_000) }),
      thread({ id: "c", isPinned: true }),
      thread({ id: "d", updatedAt: secondsAgo(3 * 86_400_000) }),
    ];
    const emitted = flattenThreads(input).filter((item) => item.kind === "thread");
    expect(emitted).toHaveLength(input.length);
    expect(new Set(emitted.map((item) => item.key)).size).toBe(input.length);
  });

  it("gives every item a key unique across headers and rows", () => {
    const items = flattenThreads([
      thread({ id: "a", isPinned: true }),
      thread({ id: "b" }),
      thread({ id: "b", provider: "claude" }),
    ]);
    expect(new Set(items.map((item) => item.key)).size).toBe(items.length);
  });

  it("preserves the incoming order within a group", () => {
    const items = flattenThreads([
      thread({ id: "first" }),
      thread({ id: "second" }),
      thread({ id: "third" }),
    ]);
    expect(
      items.filter((item) => item.kind === "thread").map((item) => item.key),
    ).toEqual(["codex:/repo:first", "codex:/repo:second", "codex:/repo:third"]);
  });

  it("returns nothing for an empty list", () => {
    expect(flattenThreads([])).toEqual([]);
  });
});
