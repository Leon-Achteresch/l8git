import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/window", () => ({
  UserAttentionType: { Informational: 2 },
  getCurrentWindow: () => ({ requestUserAttention: vi.fn().mockResolvedValue(undefined) }),
}));

import { activeTurnIds, finishedThreads } from "@/lib/agents/turn-attention";

describe("activeTurnIds", () => {
  it("maps conversations to their active turn", () => {
    expect(
      activeTurnIds({
        a: { activeTurnId: "turn-1" },
        b: { activeTurnId: null },
      }),
    ).toEqual({ a: "turn-1", b: null });
  });
});

describe("finishedThreads", () => {
  it("reports threads whose turn just completed", () => {
    expect(
      finishedThreads({ a: "turn-1", b: "turn-2", c: null }, { a: null, b: "turn-2", c: null }),
    ).toEqual(["a"]);
  });

  it("ignores newly started turns and removed threads", () => {
    expect(finishedThreads({ a: null }, { a: "turn-1" })).toEqual([]);
    expect(finishedThreads({ a: "turn-1" }, {})).toEqual(["a"]);
    expect(finishedThreads({}, { a: "turn-1" })).toEqual([]);
  });

  it("treats a replaced turn id as still running", () => {
    expect(finishedThreads({ a: "turn-1" }, { a: "turn-2" })).toEqual([]);
  });
});
