import { describe, expect, it } from "vitest";

import { flattenTurnRows } from "@/lib/agents/transcript-rows";
import type { AgentTurn } from "@/lib/agents/types";

describe("flattenTurnRows", () => {
  it("emits one row per item and an error row for failed turns", () => {
    const turns = [
      { id: "t1", status: "completed", items: [{ id: "a" }, { id: "b" }] },
      { id: "t2", status: "failed", error: "boom", items: [{ id: "c" }] },
    ] as unknown as AgentTurn[];
    expect(flattenTurnRows(turns).map((row) => row.key)).toEqual([
      "t1:a",
      "t1:b",
      "t2:c",
      "t2:error",
    ]);
  });
});
