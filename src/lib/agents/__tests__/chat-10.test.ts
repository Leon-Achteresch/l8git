import { describe, expect, it } from "vitest";

import { filterThreads, type SidebarThread } from "@/lib/agents/thread-grouping";
import {
  deriveThreadTitle,
  renameThread,
  setThreadArchived,
  setThreadPinned,
} from "@/lib/agents/session-catalog";
import type { AgentThreadSummary } from "@/lib/agents/types";

function thread(overrides: Partial<SidebarThread> & { id: string }): SidebarThread {
  return {
    provider: "codex",
    path: "/repo",
    title: overrides.id,
    preview: "",
    status: "idle",
    modelProvider: "openai",
    createdAt: 0,
    updatedAt: 0,
    archived: false,
    isPinned: false,
    ...overrides,
  } as SidebarThread;
}

function catalogThread(id: string): AgentThreadSummary {
  return {
    id,
    path: "/repo",
    title: id,
    preview: "",
    createdAt: 0,
    updatedAt: 0,
    status: "idle",
    modelProvider: "openai",
  };
}

describe("filterThreads", () => {
  it("keeps two same-named threads distinct and matches by query", () => {
    const threads = [
      thread({ id: "a", title: "Refactor login" }),
      thread({ id: "b", title: "Refactor login" }),
      thread({ id: "c", title: "Unrelated" }),
    ];
    const result = filterThreads(threads, { query: "refactor" });
    expect(result.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("hides archived threads unless showArchived is set", () => {
    const threads = [thread({ id: "active" }), thread({ id: "gone", archived: true })];
    expect(filterThreads(threads, {}).map((t) => t.id)).toEqual(["active"]);
    expect(filterThreads(threads, { showArchived: true }).map((t) => t.id)).toEqual([
      "active",
      "gone",
    ]);
  });

  it("sorts pinned threads first, then by updatedAt descending", () => {
    const threads = [
      thread({ id: "old", updatedAt: 1 }),
      thread({ id: "pinned-old", isPinned: true, updatedAt: 0 }),
      thread({ id: "new", updatedAt: 5 }),
      thread({ id: "pinned-new", isPinned: true, updatedAt: 10 }),
    ];
    expect(filterThreads(threads, {}).map((t) => t.id)).toEqual([
      "pinned-new",
      "pinned-old",
      "new",
      "old",
    ]);
  });
});

describe("session catalog thread actions", () => {
  it("renames, pins, and archives a thread while leaving others untouched", () => {
    let threadsByPath: Record<string, AgentThreadSummary[]> = {
      "/repo": [catalogThread("t1"), catalogThread("t2")],
    };

    threadsByPath = renameThread(threadsByPath, "/repo", "t1", "  New title  ");
    expect(threadsByPath["/repo"][0].title).toBe("New title");

    threadsByPath = setThreadPinned(threadsByPath, "/repo", "t1", true);
    expect(threadsByPath["/repo"][0].isPinned).toBe(true);

    threadsByPath = setThreadArchived(threadsByPath, "/repo", "t1", true);
    expect(threadsByPath["/repo"][0].archived).toBe(true);
    expect(threadsByPath["/repo"][1].title).toBe("t2");
    expect(threadsByPath["/repo"][1].isPinned).toBeUndefined();
  });

  it("ignores an empty rename and an unknown path", () => {
    const threadsByPath = { "/repo": [catalogThread("t1")] };
    expect(renameThread(threadsByPath, "/repo", "t1", "   ")).toBe(threadsByPath);
    expect(setThreadPinned(threadsByPath, "/missing", "t1", true)).toBe(threadsByPath);
  });
});

describe("deriveThreadTitle", () => {
  it("falls back to the first user message, trimmed and collapsed", () => {
    expect(deriveThreadTitle("  fix   the   bug  ")).toBe("fix the bug");
  });

  it("truncates long messages", () => {
    const long = "a".repeat(100);
    expect(deriveThreadTitle(long)).toHaveLength(61);
  });

  it("uses the fallback when the message is empty", () => {
    expect(deriveThreadTitle("   ")).toBe("New thread");
  });
});
