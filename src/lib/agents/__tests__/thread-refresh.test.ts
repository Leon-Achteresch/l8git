import { describe, expect, it } from "vitest";

import { refreshKey, shouldRefresh } from "@/lib/agents/thread-refresh";

describe("refreshKey", () => {
  it("is order-insensitive for paths", () => {
    expect(refreshKey("codex", ["/b", "/a"])).toBe(refreshKey("codex", ["/a", "/b"]));
    expect(refreshKey("codex", ["/a"])).not.toBe(refreshKey("claude", ["/a"]));
  });
});

describe("shouldRefresh", () => {
  it("allows the first call and blocks calls within the TTL", () => {
    const history = new Map<string, number>();
    expect(shouldRefresh("k", 1_000, history, 30_000)).toBe(true);
    expect(shouldRefresh("k", 20_000, history, 30_000)).toBe(false);
    expect(shouldRefresh("k", 31_001, history, 30_000)).toBe(true);
  });

  it("tracks keys independently", () => {
    const history = new Map<string, number>();
    expect(shouldRefresh("a", 1_000, history, 30_000)).toBe(true);
    expect(shouldRefresh("b", 1_000, history, 30_000)).toBe(true);
  });
});
