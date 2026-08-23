import { describe, expect, it } from "vitest";

import {
  groupInlineThreads,
  threadsByLine,
  threadsForFile,
  type PrComment,
} from "./pr-threads";

function comment(overrides: Partial<PrComment> & { id: string }): PrComment {
  return {
    author: "ada",
    author_avatar: null,
    created_at: "2024-06-01T10:00:00Z",
    body: "looks off",
    kind: "inline",
    file_path: "src/app.ts",
    line: 12,
    ...overrides,
  };
}

describe("groupInlineThreads", () => {
  it("keeps a GitHub reply chain in one thread", () => {
    const threads = groupInlineThreads([
      comment({ id: "2", thread_id: "1", in_reply_to: "1", created_at: "2024-06-01T11:00:00Z" }),
      comment({ id: "1", thread_id: "1", created_at: "2024-06-01T10:00:00Z" }),
    ]);

    expect(threads).toHaveLength(1);
    expect(threads[0].comments.map((c) => c.id)).toEqual(["1", "2"]);
    expect(threads[0].replyTo).toBe("1");
    expect(threads[0].line).toBe(12);
    expect(threads[0].filePath).toBe("src/app.ts");
  });

  it("separates two threads that sit on the same line", () => {
    const threads = groupInlineThreads([
      comment({ id: "1", thread_id: "1" }),
      comment({ id: "5", thread_id: "5" }),
    ]);

    expect(threads).toHaveLength(2);
    expect(threads.map((t) => t.replyTo)).toEqual(["1", "5"]);
  });

  it("falls back to file and line when the provider has no thread ids", () => {
    const threads = groupInlineThreads([
      comment({ id: "1" }),
      comment({ id: "2", created_at: "2024-06-01T12:00:00Z" }),
      comment({ id: "3", line: 40 }),
    ]);

    expect(threads).toHaveLength(2);
    expect(threads[0].line).toBe(12);
    expect(threads[0].comments.map((c) => c.id)).toEqual(["1", "2"]);
    expect(threads[0].replyTo).toBe("1");
    expect(threads[1].line).toBe(40);
  });

  it("ignores conversation comments and unanchored review comments", () => {
    const threads = groupInlineThreads([
      comment({ id: "1", kind: "issue", file_path: null, line: null }),
      comment({ id: "2", line: null }),
      comment({ id: "3", file_path: "  " }),
      comment({ id: "4", line: 0 }),
    ]);

    expect(threads).toEqual([]);
  });

  it("sorts threads by file and line", () => {
    const threads = groupInlineThreads([
      comment({ id: "1", file_path: "src/z.ts", line: 3 }),
      comment({ id: "2", file_path: "src/a.ts", line: 90 }),
      comment({ id: "3", file_path: "src/a.ts", line: 9 }),
    ]);

    expect(threads.map((t) => `${t.filePath}:${t.line}`)).toEqual([
      "src/a.ts:9",
      "src/a.ts:90",
      "src/z.ts:3",
    ]);
  });
});

describe("threadsForFile / threadsByLine", () => {
  it("indexes the threads of one file by their line", () => {
    const threads = groupInlineThreads([
      comment({ id: "1", thread_id: "1" }),
      comment({ id: "2", thread_id: "2" }),
      comment({ id: "3", file_path: "src/other.ts", line: 4 }),
    ]);

    const forFile = threadsForFile(threads, "src/app.ts");
    expect(forFile).toHaveLength(2);

    const byLine = threadsByLine(forFile);
    expect(byLine.get(12)).toHaveLength(2);
    expect(byLine.get(4)).toBeUndefined();
  });
});
