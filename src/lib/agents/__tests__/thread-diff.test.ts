import { describe, expect, it } from "vitest";

import {
  conversationDiffPatch,
  diffFromConversation,
  diffFromItem,
  diffFromTurns,
  keepThreadDiff,
} from "@/lib/agents/thread-diff";
import type {
  AgentConversation,
  AgentItem,
  AgentThreadSummary,
  AgentTurn,
} from "@/lib/agents/types";

function item(overrides: Partial<AgentItem> & { id: string }): AgentItem {
  return { type: "fileChange", ...overrides };
}

function turn(items: AgentItem[]): AgentTurn {
  return { id: "turn", items, status: "completed", error: null, durationMs: 1 };
}

describe("diffFromItem", () => {
  it("prefers explicit line counts from Cursor edits", () => {
    expect(
      diffFromItem(
        item({
          id: "a",
          linesAdded: 12,
          linesRemoved: 4,
          changes: [{ path: "a.ts", diff: "+too\n+many\n-ignored\n" }],
        }),
      ),
    ).toEqual({ additions: 12, deletions: 4 });
  });

  it("counts unified diff lines and skips headers", () => {
    expect(
      diffFromItem(
        item({
          id: "b",
          changes: [
            {
              path: "a.ts",
              diff: "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,2 +1,3 @@\n context\n-old\n+new\n+more\n",
            },
          ],
        }),
      ),
    ).toEqual({ additions: 2, deletions: 1 });
  });

  it("counts structuredPatch hunk lines", () => {
    expect(
      diffFromItem(
        item({
          id: "p",
          structuredPatch: [{ lines: [" context", "-old", "+new", "+more"] }],
        }),
      ),
    ).toEqual({ additions: 2, deletions: 1 });
  });
});

describe("diffFromTurns", () => {
  it("sums every file edit in the thread", () => {
    expect(
      diffFromTurns([
        turn([item({ id: "a", linesAdded: 10, linesRemoved: 1 })]),
        turn([
          item({ id: "b", linesAdded: 2, linesRemoved: 3 }),
          { id: "m", type: "agentMessage", text: "done" },
        ]),
      ]),
    ).toEqual({ additions: 12, deletions: 4 });
  });
});

describe("diffFromConversation", () => {
  it("returns null when nothing was edited", () => {
    const conversation: AgentConversation = {
      threadId: "t",
      path: "/repo",
      title: "Chat",
      model: "gpt",
      reasoningEffort: null,
      approvalPolicy: "on-request",
      sandboxMode: "workspace-write",
      turns: [turn([{ id: "m", type: "agentMessage", text: "hi" }])],
      activeTurnId: null,
      loading: false,
      error: null,
    };
    expect(diffFromConversation(conversation)).toBeNull();
    expect(diffFromConversation(undefined)).toBeNull();
  });
});

function summary(overrides: Partial<AgentThreadSummary> = {}): AgentThreadSummary {
  return {
    id: "t",
    path: "/repo",
    title: "Chat",
    preview: "",
    createdAt: 1,
    updatedAt: 1,
    status: "idle",
    modelProvider: "openai",
    ...overrides,
  };
}

describe("keepThreadDiff", () => {
  it("keeps previous counts when a list refresh has none", () => {
    expect(
      keepThreadDiff(summary(), summary({ additions: 12, deletions: 4 })),
    ).toMatchObject({ additions: 12, deletions: 4 });
  });

  it("prefers fresh counts from the new summary", () => {
    expect(
      keepThreadDiff(
        summary({ additions: 3, deletions: 1 }),
        summary({ additions: 12, deletions: 4 }),
      ),
    ).toMatchObject({ additions: 3, deletions: 1 });
  });
});

describe("conversationDiffPatch", () => {
  it("writes counted edits onto the matching thread", () => {
    const conversation: AgentConversation = {
      threadId: "t",
      path: "/repo",
      title: "Chat",
      model: "gpt",
      reasoningEffort: null,
      approvalPolicy: "on-request",
      sandboxMode: "workspace-write",
      turns: [turn([item({ id: "a", linesAdded: 8, linesRemoved: 2 })])],
      activeTurnId: null,
      loading: false,
      error: null,
    };
    expect(
      conversationDiffPatch({ "/repo": [summary()] }, conversation)?.["/repo"]?.[0],
    ).toMatchObject({ additions: 8, deletions: 2 });
  });
});
